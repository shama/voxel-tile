var EE = require('events').EventEmitter
var inherits = require('inherits')
var voxel = require('voxel')
var voxelMesh = require('voxel-mesh')

function Tile(opts) {
  EE.call(this)
  var self = this
  if (opts.THREE) opts = {game:opts}
  this.game = opts.game
  this.tilepath = opts.tilepath || ''
  this.colortilepath = opts.colortilepath || false
  this.size = opts.size || this.game.chunkSize || 32
  this.scale = opts.scale || this.size
  this.tilesize = opts.tilesize || 256
  this.tileformat = opts.tileformat || '%z/%x/%y.png'
  this.zoomax = opts.zoomax || 6
  this.zoomin = opts.zoomin || 3
  this.mesher = opts.mesher || voxel.meshers.greedy
  this.actualSize = opts.actualSize === true
  this.repeat = opts.repeat !== false
  this.flat = opts.flat === true
  this.zoom = this.zoomax

  // how the tile is heightmap'd
  this.heightmap = opts.heightmap || function(r, g, b, a) {
    return Math.floor(((r * 255 * 255 + g * 255 + b) / 16646655) * self.size)
  }

  this.queue = Object.create(null)
  this.images = Object.create(null)

  // basic color material
  this.material = new self.game.THREE.MeshBasicMaterial({
    vertexColors: self.game.THREE.FaceColors
  })
}
inherits(EE, Tile)

module.exports = function(opts) {
  return new Tile(opts)
}

// call when a chunk is missing
Tile.prototype.missingChunk = function missingChunk(pos) {
  var uri = this.whichImage(pos)
  if (uri) this.queuePos(pos, uri)
}

// set the zoom level
Tile.prototype.setZoom = function setZoom(zoom) {
  var self = this
  zoom = this.zoomax + 1 - Math.floor(Math.abs(zoom) / this.size)
  if (zoom > this.zoomax) zoom = this.zoomax
  if (zoom < this.zoomin) zoom = this.zoomin

  if (zoom === this.zoom) return
  this.zoom = zoom
  console.log('zoom', zoom)

  // Regen chunks if zoom changed
  var player = this.game.playerPosition()
  var nearbyChunks = this.game.voxels.nearbyChunks(player, this.game.removeDistance).filter(function(pos) {
    if (pos[1] < 0) return false
    return (Math.abs(pos[1]) <= 2)
  }).forEach(function(pos) {
    self.missingChunk(pos)
  })
}

// determine which image
Tile.prototype.whichImage = function whichImage(pos) {
  // TODO: Only 0 now but should handle higher elevations later
  if (pos[1] !== 0) return false
  var totaltiles = Math.pow(2, this.zoom)
  var x = pos[0], z = pos[2]
  if (this.actualSize) {
    // TODO: for loading in actual size, doesnt work right yet
    x = Math.floor(x * this.size / this.tilesize)
    z = Math.floor(z * this.size / this.tilesize)
  }
  if (this.repeat) {
    x = Math.abs(mod(x, totaltiles))
    z = Math.abs(mod(z, totaltiles))
  }
  var uri = this.tileformat
  return uri.replace('%x', x).replace('%y', z).replace('%z', this.zoom)
}

// queue up the pos for on image load
Tile.prototype.queuePos = function queuePos(pos, uri) {
  if (!Array.isArray(this.queue[uri])) this.queue[uri] = []
  this.queue[uri].push(pos)
  this.loadImage(uri)
}

// after image has loaded, generate and show it
Tile.prototype.processQueue = function processQueue(uri) {
  var self = this
  if (Array.isArray(this.queue[uri]) && this.queue[uri].length > 0) {
    var img = this.images[uri]
    if (typeof img === 'object') {
      for (var i = 0; i < this.queue[uri].length; i++) {
        var pos = this.queue[uri][i]
        this.showChunk(this.generateChunk(img, pos))
      }
      this.queue[uri] = []
    } else if (typeof img === 'integer' && img < 5) {
      // its lagging, try again
      this.images[uri]++
      setTimeout(function() {
        self.processQueue(uri)
      }, 100)
    }
  }
}

// load the image and process queue when done
Tile.prototype.loadImage = function loadImage(uri) {
  var self = this
  if (!this.images[uri]) {
    var loaded = 0
    this.images[uri] = 1
    var img = new Image()
    img.crossOrigin = ''

    function postload(img) {
      // rotate 90
      var canvas = rotate(img, -90)
      // flip horiz
      canvas = flip(canvas, 'h')
      // TODO: actual size needs to have its orientation fixed
      if (self.actualSize !== true) {
        // shrink down
        canvas = shrink(canvas, self.size)
      }
      return canvas
    }

    function onload() {
      loaded++
      if (loaded > 1) {
        //window.open(canvas.toDataURL())
        self.images[uri] = [img, imgcolor]
        self.processQueue(uri)
      }
    }

    // load color tile
    if (this.colortilepath !== false) {
      var imgcolor = new Image()
      imgcolor.crossOrigin = ''
      imgcolor.onload = function() {
        imgcolor = postload(imgcolor)
        onload()
      }
      imgcolor.src = self.colortilepath + uri
    } else {
      loaded++
    }
    
    // load height tile
    img.onload = function() {
      img = postload(img)
      onload()
    }
    img.src = self.tilepath + uri
  } else {
    this.processQueue(uri)
  }
}

// get pixels from region of image
Tile.prototype.getPixels = function getPixels(canvas, pos) {
  var x = pos[0], y = pos[1], z = pos[2]
  var context = canvas.getContext('2d')
  if (this.actualSize === true) {
    x = Math.abs(mod(x * this.size, this.tilesize))
    z = Math.abs(mod(z * this.size, this.tilesize))
    return context.getImageData(x, z, this.size, this.size)
  } else {
    return context.getImageData(0, 0, this.size, this.size)
  }
}

// for generating a chunk
Tile.prototype.generate = function generate(pos, fn) {
  var size = this.size
  var chunk = {
    position: pos,
    dims: [size, size, size],
    voxels: new Int32Array(size * size * size)
  }
  for (var idx = 0, x = 0; x < size; x++)
    for (var y = 0; y < size; y++)
      for (var z = 0; z < size; z++, idx++)
        chunk.voxels[idx] = fn(x, y, z)
  return chunk
}

// actually generate the chunk
Tile.prototype.generateChunk = function generateChunk(img, pos) {
  var self = this
  var imgcolor = img[1], img = img[0]
  var size = this.size
  var pixels = this.getPixels(img, pos)
  var pixelData = pixels.data

  // if using color map
  var pixelsColor = false
  var pixelColorData = false
  if (imgcolor) {
    pixelsColor = this.getPixels(imgcolor, pos)
    pixelColorData = pixelsColor.data
  }

  var chunk = this.generate(pos, function(x, y, z) {
    var p = (x + z * self.size) * 4
    //var p = x * 4 + z * 4 * self.size
    var r = pixelData[p], g = pixelData[p+1], b = pixelData[p+2], a = pixelData[p+3]
    var h = 1
    if (self.flat !== true) {
      h = self.heightmap(r, g, b, a)
    }
    if (pixelsColor !== false) {
      r = pixelColorData[p], g = pixelColorData[p+1], b = pixelColorData[p+2], a = pixelColorData[p+3]
    }
    var color = rgbtohex(r, g, b)
    return y < h ? color : 0
  })
  //pixels.data = pixelData
  /*delete canvas
  delete context
  delete pixelData
  delete pixels*/
  return chunk
}

// our own show chunk as it's handled a little different
Tile.prototype.showChunk = function showChunk(chunk) {
  var game = this.game
  //game.showChunk(chunk)
  var chunkIndex = chunk.position.join('|')
  var chunkBounds = game.voxels.getBounds.apply(game.voxels, chunk.position)
  var scale = new game.THREE.Vector3(1, 1, 1)
  var mesh = voxelMesh(chunk, this.mesher, scale, game.THREE)
  game.voxels.chunks[chunkIndex] = chunk
  if (game.voxels.meshes[chunkIndex]) game.scene.remove(game.voxels.meshes[chunkIndex][game.meshType])
  game.voxels.meshes[chunkIndex] = mesh
  mesh.createSurfaceMesh(this.material)
  mesh.setPosition(chunkBounds[0][0], chunkBounds[0][1], chunkBounds[0][2])
  mesh.addToScene(game.scene)
  game.emit('renderChunk', chunk)
  return mesh
}


function mod(num, n) { return ((num % n) + n) % n }

function rgbtohex(r, g, b) {
  return parseInt('0x' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1))
}

function rotate(img, deg) {
  var canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  var context = canvas.getContext('2d')
  context.save()
  context.translate(img.width/2, img.height/2)
  context.rotate(deg * Math.PI / 180)
  context.drawImage(img, -(img.width/2), -(img.height/2), img.width, img.height)
  context.restore()
  return canvas
}

function shrink(img, size) {
  var canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  var context = canvas.getContext('2d')
  context.save()
  context.drawImage(img, 0, 0, img.width, img.height, 0, 0, size, size)
  context.restore()
  return canvas
}

function flip(img, way) {
  way = way || 'h'
  var canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  var context = canvas.getContext('2d')
  context.save()
  if (way !== 'h') {
    context.translate(img.width, 0)
    context.scale(-1, 1)
  } else {
    context.translate(0, img.height)
    context.scale(1, -1)
  }
  context.drawImage(img, 0, 0)
  context.restore()
  return canvas
}
