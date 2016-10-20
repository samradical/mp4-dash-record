require('shelljs/global')
var fs = require('fs');
var path = require('path');
var readDir = require('readdir');
var Dash = require('./lib/dash-upload');
var readDir = require('readdir');

var config = {
  "inputDir":false,
  "covert":"false",
  "dash":true,
  "upload":true,
  "uploadDetails":{
    "bucket":"samrad-alys"
  }
}
config.inputDir = config.inputDir || path.join(process.cwd(), '../')


function r(inputDir, filter = ['**.mp4', '**.avi']) {
  return readDir.readSync(inputDir, filter, readDir.ABSOLUTE_PATHS)
}
module.exports = {
  readdir: r,
  Dash: Dash,
  config: config
}
