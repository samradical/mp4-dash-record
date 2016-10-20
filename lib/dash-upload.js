require('shelljs/global')
var uuid = require('uuid');
var xml2js = require('xml2js');
var path = require('path');
var fs = require('fs-extra');
var Q = require('bluebird');
var XMLHttpRequest = require('xhr2');
var checkUrlExists = require('./util').checkUrlExists
var Sidx = require('./sidx')
console.log(Sidx);

var name = path.parse(process.cwd()).name
const ROOT = process.cwd()
const DASH_DIR = path.join(process.cwd(), name)
const GCLOUD = `https://storage.googleapis.com/`
if (!fs.existsSync(DASH_DIR)) {
  fs.mkdirpSync(DASH_DIR);
}

let DEFAULT_CONFIG = {
  "inputDir": false,
  "clean": "false",
  "covert": "false",
  "dash": true,
  "upload": true,
  dashDistance: 4000,
  "uploadDetails": {
    bucket: null
  }
}

const DASH = (() => {
  var parser = new xml2js.Parser();
  var googleCloudUrl

  function dashUpload(file, config = {}) {
    return new Q((resolve, reject) => {
      if (!config.inputDir) {
        return reject(new Error('Specify inputDir'))
      }
      if (!config.uploadDetails.bucket) {
        return reject(new Error('Specify uploadDetails.bucket'))
      }
      config = Object.assign({}, DEFAULT_CONFIG, config)
      googleCloudUrl = GCLOUD + config.uploadDetails.bucket


      var parsed = path.parse(file)
      var dir = parsed.dir.replace(ROOT, '')
      var name = parsed.name
      var input = name
      var inputFile = file
      var output = name += uuid.v1()
      var base = parsed.base

      if (parsed.ext !== '.mp4') {
        let _n = path.join(parsed.dir, `${name}_.mp4`)
        let _covertCmd = `ffmpeg -i ${file} -y ${_n}`
        console.log(_covertCmd);
        exec(_covertCmd)
        parsed = path.parse(_n)
        name = parsed.name
        input = name
        //output = name += uuid.v1()
        base = parsed.base
        inputFile = _n
      }


      let _outDir = path.join(DASH_DIR, dir, input)
      console.log(_outDir);
      if (!fs.existsSync(_outDir)) {
        fs.mkdirpSync(_outDir);
      }

      cd(_outDir)

      var dis = config.dashDistance || 4000;
      var command = 'MP4BOX -dash ' + dis + ' -frag ' + dis + ' -rap -frag-rap -profile onDemand ' + inputFile + ' -out ' + output;
      console.log(command);
      exec(command)
      let dashedOutFile = path.join(_outDir, `${output}_dashinit${parsed.ext}`)
      fs.renameSync(path.join(_outDir, `${input}_dashinit${parsed.ext}`), dashedOutFile)

      _parseMpd(`${output}.mpd`, (mpd) => {
        _upload(dashedOutFile, _outDir, mpd, config, (mpd) => {
          var manifestName = output
          mpd.id = input
          _saveManifest(manifestName, mpd)
          let _n = `${manifestName}.json`
          let _uploadedManifest = _uploadManifest(_n, config)
          cd(ROOT)
          resolve({ id: input, url: _uploadedManifest })
        })
      })
    })
  }

  function _parseMpd(file, cb) {
    var mpdVo = {
      codecs: undefined,
      bandwidth: undefined,
      baseUrl: undefined,
      indexRange: undefined
    };
    fs.readFile(file, function(err, data) {
      parser.parseString(data, function(err, result) {
        var repesentation = result['MPD']['Period'][0]['AdaptationSet'][0]['Representation'][0];
        mpdVo['codecs'] = repesentation['$']['codecs'];
        mpdVo['bandwidth'] = repesentation['$']['bandwidth'];
        mpdVo['baseUrl'] = '';
        mpdVo['indexRange'] = '0-' + repesentation['SegmentBase'][0]['$']['indexRange'].split('-')[1];
        cb(mpdVo)
      });
    });
  }

  function _upload(file, outDir, mpd, config, cb) {
    console.log("_upload");
    console.log(file);
    var base = path.parse(file).base
    var dir = path.parse(file).dir.replace(ROOT, '')
    outDir = outDir.replace(ROOT, '')
    if (config.clean) {
      console.log("Cleaning");
      var _ccmd = `gsutil rm -Ra gs://${config.uploadDetails.bucket}${outDir}/`
      console.log(_ccmd);
      exec(_ccmd)
    }
    var cmd = `gsutil -m cp -Rn -a public-read ${file}  gs://${config.uploadDetails.bucket}${dir}/${base}`
    exec(cmd)
    let _remote = googleCloudUrl + path.join(dir, base)
    _getSidx(_remote, mpd, cb)
  }

  function _getSidx(url, mpd, cb) {
    console.log(url);
    console.log(mpd);
    console.log(mpd['indexRange']);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader("Range", "bytes=" + mpd['indexRange']);
    xhr.responseType = 'arraybuffer';
    xhr.send();
    try {
      xhr.addEventListener("readystatechange", function() {
        if (xhr.readyState === xhr.DONE) { // wait for video to load
          // Add response to buffer
          console.log(xhr.response);
          mpd['sidx'] = Sidx.parseSidx(xhr.response);
          if (!mpd['sidx']) {
            console.log("Failed to get sidx");
          }
          mpd.url = url
          cb(mpd)
        }
      }, false);
    } catch (e) {}
  }

  function _saveManifest(name, mpd) {
    console.log(mpd.id, "numRefs: ", mpd.sidx.referenceCount);
    fs.writeFileSync(`${name}.json`, JSON.stringify(mpd), 'utf-8')
  }

  function _uploadManifest(name, config) {
    var file = path.join(process.cwd(), name)
    var dir = path.parse(file).dir.replace(ROOT, '')
    console.log(file);
    var cmd = `gsutil -m cp -Rn -a public-read ${file}  gs://${config.uploadDetails.bucket}${dir}`
    exec(cmd)
    return `${googleCloudUrl}${dir}/${name}`
  }




  /*if (OPTIONS.verbose) {
      console.log(colors.green('MP4Box: %s'), command);
    }
    var ls = child_process.exec(command);

    ls.on('close', function(code) {
      //mp4box ads this _dashedinit
      var dashedMp4Path = seg['directory'] + '/' + seg['name'] + '_dashinit.mp4';
      //new name
      var newPath = seg['directory'] + '/' + dashedName;
      //save new dashpath
      seg['clip']['dashedPath'] = newPath;
      //rename
      fs.rename(dashedMp4Path, newPath, function(err) {
        if (err) {
          defer.resolve(seg);
        } else {
          //set the correct path
          seg['mpdPath'] = _findMpdFile(seg['directory']);
          //parse
          _parseMpd(seg, dashedName, defer);
        }
      });
    });

    ls.on('error', function(stdin, stderr) {
      defer.resolve(seg);
    });
  */

  return {
    dashUpload: dashUpload,
    getSidx: _getSidx,
    parseMpd: _parseMpd,
    config: DEFAULT_CONFIG
  }
})()

module.exports = DASH

/*

function _findMpdFile(directory) {
  var mpdPath = '';
  var files = fs.readdirSync(directory);
  _.each(files, function(name) {
    if (name.indexOf('.mpd') !== -1) {
      mpdPath = directory + '/' + name;
    }
  });
  return mpdPath;
}

function _parseMpd(seg, dashedName, defer) {
  var mpdVo = _.clone(require('./vo/mpd.js'));

  fs.readFile(seg['mpdPath'], function(err, data) {
    parser.parseString(data, function(err, result) {
      if (err || !result) {
        defer.reject(seg);
        return;
      }
      var repesentation = result['MPD']['Period'][0]['AdaptationSet'][0]['Representation'][0];
      mpdVo['codecs'] = repesentation['$']['codecs'];
      mpdVo['bandwidth'] = repesentation['$']['bandwidth'];
      mpdVo['baseUrl'] = dashedName;
      mpdVo['indexRange'] = '0-' + repesentation['SegmentBase'][0]['$']['indexRange'].split('-')[1];
      mpd = mpdVo;
      _deleteMpd(seg);
      _deleteOldMp4(seg);

      defer.resolve(seg);
    });
  });
}
*/
