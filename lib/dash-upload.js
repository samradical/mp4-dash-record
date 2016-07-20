require('shelljs/global')
var xml2js = require('xml2js');
var path = require('path');
var fs = require('fs');
var XMLHttpRequest = require('xhr2');
var http = require('http')
var checkUrlExists = require('./util').checkUrlExists
console.log(checkUrlExists);
const DASH = (() => {
  var parser = new xml2js.Parser();
  var googleCloudUrl = `https://storage.googleapis.com/`

  function dashUpload(file, config) {
    googleCloudUrl += config.uploadDetails.bucket + '/'
    var parsed = path.parse(file)
    var name = path.parse(file).name
    var base = path.parse(file).base
    var dis = 1000;
    var command = 'MP4BOX -dash ' + dis + ' -frag ' + dis + ' -rap -frag-rap -profile onDemand ' + file;
    console.log(command);
    exec(command)

    let dashedOutFile = path.join(parsed.dir, `${name}_dashinit${parsed.ext}`)

    _parseMpd(`${name}_dash.mpd`, (mpd) => {
      let _finalUrl = `${googleCloudUrl}${name}_dashinit${parsed.ext}`
      checkUrlExists(_finalUrl, (d) => {
        console.log(d);
        if (!d) {
          _upload(dashedOutFile, mpd, config, (mpd) => {
            _saveManifest(name, mpd)
            _uploadManifest(path.join(process.cwd(),`${name}.json`), config)
          })
        } else {
          _getSidx(_finalUrl, mpd, (mpd) => {
            _saveManifest(name, mpd)
            _uploadManifest(path.join(process.cwd(),`${name}.json`), config)
          })
        }
      })
    })
  }

  function _checkIfFileExists() {
    var options = { method: 'HEAD', host: 'https://storage.googleapis.com/', port: 80, path: 'samrad-alys/video_dashinit.mp4' },
      req = http.request(options, function(r) {
        console.log(JSON.stringify(r.headers));
      });
    req.end();
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

  function _upload(file, mpd, config, cb) {
    var cmd = `gsutil -m cp -r -a public-read ${file}  gs://${config.uploadDetails.bucket}`
    exec(cmd)
    var base = path.parse(file).base
    let remoteFile = `${googleCloudUrl}${base}`
    _getSidx(remoteFile, mpd, cb)
  }

  function _getSidx(url, mpd, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader("Range", "bytes=" + mpd['indexRange']);
    xhr.send();
    xhr.responseType = 'arraybuffer';
    try {
      xhr.addEventListener("readystatechange", function() {
        if (xhr.readyState == xhr.DONE) { // wait for video to load
          // Add response to buffer
          mpd['sidx'] = require('./sidx').parseSidx(xhr.response);
          if (!mpd['sidx']) {}
          cb(mpd)
        }
      }, false);
    } catch (e) {}
  }

  function _saveManifest(name, mpd){
    fs.writeFileSync(`${name}.json`, JSON.stringify(mpd), 'utf-8')
  }

  function _uploadManifest(file, config){
    var cmd = `gsutil -n -m cp -r -a public-read ${file}  gs://${config.uploadDetails.bucket}`
    exec(cmd)
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
    dashUpload: dashUpload
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
