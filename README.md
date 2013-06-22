# voxel-tile

**WORK IN PROGRESS**

Load google map or open street map tiles into [voxel.js](http://voxeljs.com).

## example

```js
var tile = require('voxel-tile')({
  game: game,

  // Path to tile images
  tilepath: 'textures/heightmap/tiles/',

  // [optional] Load a separate tile for coloring
  // (otherwise it will just use the colors from the heightmap)
  colortilepath: 'textures/colormap/tiles/',

  // [optional] Size of chunks
  size: 32,

  // [optional] Size of tiles
  tilesize: 256,

  // [optional] URL format to tiles
  tileformat: '%z/%x/%y.png',

  // [optional] Maximum zoom level
  zoomax: 6,
  // [optional] Minimum zoom level
  zoomin: 3,

  // [optional] Voxel mesher to mesh with
  mesher: voxel.meshers.greedy,

  // [optional] Boolean whether the tiles should infinitely repeat
  repeat: true,

  // [optional] Boolean whether to render the world flat
  flat: false,

  // [optional] Function to determine height based on color
  heightmap: function(r, g, b, a) {
    return Math.floor(((r * 255 * 255 + g * 255 + b) / 16646655) * 32)
  },
})

// On missing chunk, load up tile for chunk position
game.voxels.on('missingChunk', tile.missingChunk.bind(tile))

// Set zoom level based on the current player height distance
game.on('tick', function() {
  tile.setZoom(player.yaw.position.y)
})
```

## install

With [npm](https://npmjs.org) do:

```
npm install voxel-tile
```

Use [browserify](http://browserify.org) to `require('voxel-tile')`.

## release history
* 0.1.0 - initial release

## license
Copyright (c) 2013 Kyle Robinson Young<br/>
Licensed under the MIT license.
