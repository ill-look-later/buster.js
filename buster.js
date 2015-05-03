var _ = require('lodash');
var os = require('os');
var fs= require('fs');
var sys = require('sys');
var path = require('path');
var child = require('child_process').exec;
var argv = require('minimist')(process.argv.slice(2));
var walk = require('walk');
var cheerio = require('cheerio');
var async = require('async');
var css = require('css');

function main() {
    var staticPath = path.join(__dirname, 'static');
    var command = [
            "wget",
            "--recursive",
            "--convert-links",
            "--no-parent",
            "--no-host-directories",
            "--restrict-file-name=windows",
            "--page-requisites",
            "--directory-prefix static",
            "localhost:2368"
            ].join(' ');
    console.log(command);
    child(command, function(error, stdout, stderr) {
        async.series([
            //function(cb) {
            //    fixScriptErrors(stderr, cb);
            //},
            function(cb) {
                removeQueryString(cb);
            },
            function(cb) {
                fixHtmlLinks(cb);
            }
        ], function(err, res) {
        });
    });
}

function removeQueryString(cb) {
    var walker = walk.walk(path.join(__dirname, 'static'));
    walker.on("file", function(root, fileStats, next) {
        if(fileStats.name.match(/.*?(@v.*)/)) {
            var newName = fileStats.name.replace(/@v.*/, '');
            console.log("Rename", fileStats.name, "=>", newName);
            fs.rename(path.join(root, fileStats.name), path.join(root, newName), function() {
                next();
            });
        } else {
            next();
        }
    });
    walker.on("end", function() {
        cb(null, "one");
    });
}

function fixLinks(body) {
    var absUrlRegexp = new RegExp("^(?:[a-z]+:)?\/\/", "gi");
    var localhostUrlRegexp = /^(.*)@v=.*$/gi;
    var $ = cheerio.load(body);
    var cleanElement = function(i, elem) {
        var newHref;
        var match;
        if (elem.hasOwnProperty('attribs')) {
            if(elem.attribs.hasOwnProperty('href')) {

                if(!elem.attribs.href.match(absUrlRegexp)) {
                    newHref = elem.attribs.href.replace(/rss\/index.html$/, 'rss\/index.rss');
                    newHref = elem.attribs.href.replace(/\/index\.html$/, '/');
                    console.log("\t",elem.attribs.href,newHref);
                    elem.attribs.href = newHref;
                } 

                if (elem.attribs.href.match(localhostUrlRegexp)){
                    match = localhostUrlRegexp.exec(elem.attribs.href);
                    newHref = elem.attribs.href.replace(match[0], match[1]);
                    console.log("\t", elem.attribs.href, newHref);
                    elem.attribs.href = newHref;
                }

            } else if (elem.attribs.hasOwnProperty('src')) {
                if (elem.attribs.src.match(localhostUrlRegexp)){
                   match = localhostUrlRegexp.exec(elem.attribs.src);
                   newSrc = elem.attribs.src.replace(match[0], match[1]);
                   console.log("\t", elem.attribs.src, newSrc);
                   elem.attribs.src = newSrc;
                }
            }
        }
    };

    ['a', 'script', 'link' ].forEach(function(tag) {
        $(tag).each(function(i, elem) {
            cleanElement(i, elem);
        });
    });
    return($.html());
}

function fixCssFonts(body) {
    var oldVal;
    var stylesheet = css.parse(String(body));
    var fonts = _.filter(stylesheet.stylesheet.rules, function(a) {
        return a.type === "font-face";
    });
    fonts.forEach(function(font) {
        font.declarations.forEach(function(dec) {
            if (dec.property === 'src') {
                oldVal = dec.value;
                newVal = dec.value.replace(/@v=.*?"/g, '"');
                console.log("\t", oldVal, '=>', newVal);
                dec.value = newVal;
            }
        });
    });
    return css.stringify(stylesheet);
}

function fixHtmlLinks(cb) {
    var walker = walk.walk(path.join(__dirname, 'static'));
    var filepath, newFilepath, newText;
    walker.on("file", function(root, fileStats, next) {
        if (path.extname(fileStats.name) === ".html") { //parse all html files
            filepath = path.join(root, fileStats.name); 
            if (path.basename(root) === 'rss') { //rename rss index.html to index.rss
                newFilepath = path.join(root, 'index.rss');
                fs.rename(filepath, newFilepath, function() {
                    next();
                });
            } else {
                fs.readFile(filepath, function(err, body) {
                    console.log("fixing links in", filepath);
                    newText = fixLinks(body);
                    newText = String(newText).replace(/localhost:2368/g, 'www.mimirate.com');
                    fs.writeFile(filepath, newText, function(err) {
                        if (!err) { 
                            next(); 
                        } else  {
                            console.log(err);
                            next();
                        }
                    });
                });
            }
        } else if (path.extname(fileStats.name) === '.css') {
            filepath = path.join(root, fileStats.name);
            fs.readFile(filepath, function(err, body){
                console.log("fixing css links in", filepath);
                newText = fixCssFonts(body);
                fs.writeFile(filepath, newText, function(err) {
                    if(!err) {
                        next();
                    } else {
                        console.log(err);
                        next();
                    }
                });
            });
        } else {
            next();
        }
    });
    walker.on("end", function() {
        cb(null, "two");
    });
}

main();
