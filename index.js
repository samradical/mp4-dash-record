require('shelljs/global')
var fs = require('fs');
var path = require('path');
var readDir = require('readdir');
var Dash = require('./lib/dash-upload');
var readDir = require('readdir');

var CONFIG = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
CONFIG.inputDir = CONFIG.inputDir || path.join(process.cwd(), '../')
var INPUT_FILES = readDir.readSync(CONFIG.inputDir, ['**.mp4', '**.avi'], readDir.ABSOLUTE_PATHS)
  .filter(path => {
    return !(path.indexOf('dashinit') > -1)
  });
console.log(INPUT_FILES);

INPUT_FILES.forEach(path => {
  Dash.dashUpload(path, CONFIG)
})

if(!INPUT_FILES.length){
    console.log("No files");
    process.exit()
}
