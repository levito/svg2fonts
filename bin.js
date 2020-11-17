#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable no-sync */
'use strict';

const SVGIcons2SVGFontStream = require('svgicons2svgfont');
const fs = require('fs');
const path = require('path');
const svg2ttf = require('svg2ttf');
const ttf2woff = require('ttf2woff');
const ttf2woff2 = require('ttf2woff2');
const ttf2eot = require('ttf2eot');
const cssesc = require('cssesc');
const he = require('he');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const sanitizeFileName = require("sanitize-filename");
const {readDirDeep} = require('./util');
const {ArgumentParser} = require('argparse');


const parser = new ArgumentParser({
    version: require('./package.json').version,
    addHelp: true,
    description: "Converts a directory full of SVG icons into webfonts"
});
parser.addArgument(
    'src',
    {
        help: 'Source directory'
    }
);

parser.addArgument(
    ['-o', '--out-dir'],
    {
        help: 'Output directory'
    }
);

parser.addArgument(
    ['-n', '--font-name'],
    {
        help: 'Font name',
    }
);

parser.addArgument(
    ['-f', '--file'],
    {
        help: 'Output filenames (without extension)',
    }
);

parser.addArgument(
    ['-p', '--prefix'],
    {
        help: 'CSS class name prefix',
    }
);

parser.addArgument(
    ['-b', '--base'],
    {
        help: 'CSS class name added to all icons',
    }
);

parser.addArgument(
    '--directory-separator',
    {
        help: 'The string to use in CSS class names when the icon files are in sub-directories',
        defaultValue: '-'
    }
);

parser.addArgument(
    '--fixed-width',
    {
        help: 'Creates a monospace font of the width of the largest input icon',
        action: 'storeTrue',
    }
);

const args = parser.parseArgs();

if(!args.prefix && !args.base) {
    console.error(`${path.basename(process.argv[1])}: Not enough arguments. Either --prefix, --base or both must be provided.`);
    process.exit(1);
}

// console.log(args);process.exit();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


const cssStr = s => cssesc(s, {wrap: true});
const cssId = s => cssesc(s, {isIdentifier: true});

const inputDir = args.src;
const outputDir = args.out_dir || '.';
const fontName = args.font_name || path.basename(inputDir);
const fileName = args.file || sanitizeFileName(fontName);
const cssPrefix = args.prefix || '';
const cssBase = args.base || null;

const svgFontFile = `${outputDir}/${fileName}.svg`;
const ttfFontFile = `${outputDir}/${fileName}.ttf`;
const woffFontFile = `${outputDir}/${fileName}.woff`;
const woff2FontFile = `${outputDir}/${fileName}.woff2`;
const eotFile = `${outputDir}/${fileName}.eot`;
const cssFile = `${outputDir}/${fileName}.css`;
const htmlFile = `${outputDir}/${fileName}.html`;
const jsFile = `${outputDir}/${fileName}.js`; // map icon name to css class and/or character
// TODO: should we use a JSON file instead?
// TODO: should we allow customization over how the names are generated (allow something other than camelCase)?
const codePointFile = `${outputDir}/${fileName}-chars.json`;


mkdirp.sync(outputDir);

const fontStream = new SVGIcons2SVGFontStream({
    fontName: fontName,
    normalize: true,
    fontHeight: 5000,
    fixedWidth: args.fixed_width,
    centerHorizontally: true,
    log: () => {
    },
});

const svgFileStream = fs.createWriteStream(svgFontFile);

fontStream.pipe(svgFileStream)
    .on('finish', function() {
        console.log(`Wrote ${svgFontFile}`);
        createFonts();
    })
    .on('error', function(err) {
        console.log(err);
    });


readDirDeep(inputDir).then(icons => {
    icons = icons.filter(filename => /\.svg$/i.test(filename));
    const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
    icons.sort(collator.compare);

    // console.log(icons);process.exit();

    let codePointCounter = 0xF000;

    const cssDir = path.dirname(cssFile);
    const htmlDir = path.dirname(htmlFile);

    let css = `
@font-face {
  font-family: ${cssStr(fontName)};
  src: url(${cssStr(path.relative(cssDir, eotFile))}); /* IE9 Compat Modes */
  src: url(${cssStr(path.relative(cssDir, eotFile) + '?iefix')}) format('embedded-opentype'), /* IE6-IE8 */
    url(${cssStr(path.relative(cssDir, woff2FontFile))}) format('woff2'), /* Edge 14+, Chrome 36+, Firefox 39+, some mobile */
    url(${cssStr(path.relative(cssDir, woffFontFile))}) format('woff'),  /* IE 9+, Edge, Firefox 3.6+, Chrome 5+, Safari 5.1+ */
    url(${cssStr(path.relative(cssDir, ttfFontFile))}) format('truetype'), /* Safari, Android, iOS */
    url(${cssStr(path.relative(cssDir, svgFontFile))}) format('svg'); /* Legacy iOS */
  font-weight: normal;
  font-style: normal;
}
${cssBase ? `.${cssId(cssBase)}` : `[class^="${cssId(cssPrefix)}"], [class*=" ${cssId(cssPrefix)}"]`} {
  font-family: ${cssStr(fontName)} !important; /* Use !important to prevent issues with browser extensions that change fonts */
  speak: none;
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
  text-rendering: optimizeSpeed; /* Kerning and ligatures aren't needed */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`.trimLeft();


    let cssIcons = [];
    let htmlIcons = [];
    let iconMap = {};
    let codePointMap = {};

    try {
        codePointMap = JSON.parse(fs.readFileSync(codePointFile, {encoding: 'utf8'}));
        codePointCounter = Math.max(...Object.values(codePointMap)) + 1;
    } catch(err) {
        if(err.code === 'ENOENT') {
            console.log(`'${codePointFile}' not found, generating new code points`);
        } else {
            throw err;
        }
    }

    for(let icon of icons) {
        let glyph = fs.createReadStream(icon);

        let relPath = path.relative(inputDir, icon);
        let iconName = relPath.slice(0, -4).replace(/[\/\\]+/g, args.directory_separator);
        
        if(!codePointMap[relPath]) {
            codePointMap[relPath] = codePointCounter++;
        }
        
        let iconChar = String.fromCodePoint(codePointMap[relPath]);
        
        glyph.metadata = {
            unicode: [iconChar],
            name: iconName,
        };
        fontStream.write(glyph);


        let className = `${cssPrefix}${iconName}`;

        let cssSelector = `.${cssId(className)}`;
        if(!cssPrefix) {
            cssSelector = `.${cssId(cssBase)}${cssSelector}`;
        }

        let htmlClass = className;
        if(cssBase) {
            htmlClass = `${cssBase} ${htmlClass}`;
        }

        cssIcons.push(`${cssSelector}:before {
  content: ${cssStr(iconChar)}
}`);

        htmlIcons.push(`<a href="" class="s2i__icon-link"><i class="${he.escape(htmlClass)}"></i><span class="s2i__classname">${he.escape(htmlClass)}</span></a>`);
        iconMap[_.camelCase(iconName)] = htmlClass;
    }
    
    css += cssIcons.join('\n');

    fontStream.end();

    fs.writeFile(jsFile, `export default ${JSON.stringify(iconMap, null, 4)};`, {encoding: 'utf8'}, err => {
        if(err) throw err;
        console.log(`Wrote ${jsFile}`);
    });

    fs.writeFile(cssFile, css, {encoding: 'utf8'}, err => {
        if(err) throw err;
        console.log(`Wrote ${cssFile}`);
    });

    fs.writeFile(codePointFile, JSON.stringify(codePointMap, null, 4), {encoding: 'utf8'}, err => {
        if(err) throw err;
        console.log(`Wrote ${codePointFile}`);
    });

    let html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${he.escape(fontName)} Preview</title>
    <link rel="stylesheet" href="${he.escape(path.relative(htmlDir, cssFile))}">
    <style>
        .s2i__page-title {
            font-family: Helvetica, Arial, Sans-Serif;
            margin: 20px 0 10px 0;
        }
        .s2i__page-wrap {
            margin: 0 auto;
            max-width: 1000px;
            padding: 0 1rem;
        }
        .s2i__container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            grid-gap: 3px;
        }
        .s2i__icon-link {
            display: block;
            text-align: center;
            border: 1px solid #ccc;
            padding: 5px;
            text-decoration: none;
            color: black;
            overflow: hidden;
        }
        .s2i__icon-link:hover {
            background-color: #3af;
            color: white;
            border-color: #2E99E6;
        }
        .s2i__icon-link > i {
            font-size: 32px;
            background-color: #e8e8e8;
        }
        .s2i__icon-link:hover > i {
            background-color: #2E99E6;
        }
        .s2i__classname {
            display: block;
            font-family: monospace;
            font-size: 10px;
            white-space: nowrap;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    </style>
  </head>
  <body>
    <div class="s2i__page-wrap">
        <h1 class="s2i__page-title">${he.escape(fontName)}</h1>
        <div class="s2i__container">
            ${htmlIcons.join('\n            ')}
        </div>
    </div>
    <script>
        Array.prototype.forEach.call(document.querySelectorAll( '.s2i__icon-link' ), function (a) {
            a.addEventListener('click', function(ev) {
                ev.preventDefault();
                let classname = a.querySelector('.s2i__classname');
                if(classname) {
                    let range = document.createRange();
                    range.selectNodeContents(classname);
                    let selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    document.execCommand("Copy", false, null);
                }
            }, false );
        });
    </script>
  </body>
</html>
`.trimLeft();

    fs.writeFile(htmlFile, html, {encoding: 'utf8'}, err => {
        if(err) throw err;
        console.log(`Wrote ${htmlFile}`);
    });
});

function createFonts() {
    let svgString = fs.readFileSync(svgFontFile, {encoding: 'utf8'});
    const ttf = svg2ttf(svgString, {});
    fs.writeFileSync(ttfFontFile, ttf.buffer);
    console.log(`Wrote ${ttfFontFile}`);

    let ttfBuffer = fs.readFileSync(ttfFontFile);
    const woff = ttf2woff(ttfBuffer, {});
    fs.writeFileSync(woffFontFile, woff.buffer);
    console.log(`Wrote ${woffFontFile}`);

    fs.writeFileSync(woff2FontFile, ttf2woff2(ttfBuffer));
    console.log(`Wrote ${woff2FontFile}`);

    fs.writeFileSync(eotFile, ttf2eot(ttfBuffer));
    console.log(`Wrote ${eotFile}`);
}
