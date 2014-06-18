/*
 * grunt-contrib-mysqldump
 * https://github.com/tomshaw/grunt-mysqldump
 *
 * Copyright (c) 2014 Tom Shaw
 * Licensed under the MIT license.
 */
'use strict';

var fs = require('fs');
var shell = require('shelljs');
var path = require('path');
var eachAsync = require('each-async');
var zlib = require('zlib');
var archiver = require('archiver');
var bytes = require('bytes');

module.exports = function (grunt) {

  var exports = {
    options: {}
  };

  exports.gzip = function (files, done) {
    exports.init(files, zlib.createGzip, '.gzip', done);
  };

  exports.deflate = function (files, done) {
    exports.init(files, zlib.createDeflate, '.deflate', done);
  };

  exports.deflateRaw = function (files, done) {
    exports.init(files, zlib.createDeflateRaw, '.deflate', done);
  };

  exports.tar = function (files, done) {
    exports.init(files, 'tar', '.tar', done);
  };

  exports.tgz = function (files, done) {
    exports.init(files, 'tgz', '.tgz', done);
  };

  exports.zip = function (files, done) {
    exports.init(files, 'zip', '.zip', done);
  };

  exports.init = function (files, algorithm, extension, done) {

    eachAsync(files, function (file, index, done) {

      var options = exports.options,
        folder = options.dest,
        path = options.dest + file + '.sql';

      if (grunt.file.isDir(path)) {
        return done();
      }

      grunt.file.mkdir(folder);

      var cmd = grunt.template.process("mysqldump -h <%= host %> -P <%= port %> -u <%= user %> <%= pass %> <%= database %> -r <%= dest %>", {
        data: {
          user: options.user,
          pass: '--password="' + options.pass + '"',
          database: file,
          host: options.host,
          port: options.port,
          dest: path
        }
      });

      shell.exec(cmd, {
        silent: true
      }, function (code, output) {

        if (code !== 0) {
          grunt.log.writeln('Warning: ' + String(file).cyan + ' code: (' + String(code).red + ') output: (' + String(output).red + ')');
          exports.delete(path);
          return done();
        }

        if (exports.options.both === true) {
          grunt.log.writeln('Exported: ' + String(path).cyan + ' (' + exports.getSize(path) + ')');
        }

        if (options.compress) {
          exports.compress(path, algorithm, extension, done);
        } else {
          return done();
        }

      });

    });
    
  };

  exports.compress = function (file, algorithm, extension, done) {

    if (grunt.util._.include(['.gzip', '.deflate', '.deflateRaw'], extension) === true) {

      if (extension === '.gzip') {
        extension = '.gz';
      }

      var srcStream = fs.createReadStream(file);
      var destStream = fs.createWriteStream(file + extension);
      var compressor = algorithm.call(zlib, exports.options);

      compressor.on('error', function (err) {
        grunt.log.error(err);
        return done();
      });

      destStream.on('close', function () {
        grunt.log.writeln('Generated file: ' + String(file + extension).cyan + ' (' + exports.getSize(file + extension) + ')');
        if (exports.options.both === false) {
          exports.delete(file);
        }
        return done();
      });

      srcStream.pipe(compressor).pipe(destStream);

    } else if (grunt.util._.include(['.zip', '.tar', '.tgz'], extension) === true) {

      if (extension === '.tgz') {
        extension = '.tar.gz';
        algorithm = 'tar';
        exports.options.gzip = true;
        exports.options.gzipOptions = {level: exports.options.level};
      }

      var archive = archiver.create(algorithm, exports.options);

      var destStream = fs.createWriteStream(file + extension);

      archive.on('error', function (err) {
        grunt.fail.warn(err);
        return done();
      });

      archive.on('entry', function (file) {
        grunt.verbose.writeln(String(JSON.stringify(file)).red);
      });

      destStream.on('error', function (err) {
        grunt.fail.warn(err);
        return done();
      });

      destStream.on('close', function () {
        var size = archive.pointer();
        grunt.log.writeln('Archived: ' + String(file + extension).cyan + ' (' + bytes(size) + ')');
        if (exports.options.both === false) {
          exports.delete(file);
        }
        return done();
      });

      archive.pipe(destStream);

      if (grunt.file.isFile(file)) {
        archive.file(file, {
          name: path.basename(file)
        });
      }

      archive.finalize();

    } else {
      grunt.fail.warn('Compress mode: ' + extension + ' is not supported.');
      return done();
    }

  }

  exports.delete = function (file) {
    if (grunt.file.isFile(file)) {
      try {
        grunt.file.delete(file);
      } catch (e) {}
    }
  };

  exports.getSize = function (file) {
    var size = 0;
    if (typeof file === 'string') {
      try {
        size = fs.statSync(file).size;
      } catch (e) {}
    }
    return bytes(size);
  };

  return exports;
};
