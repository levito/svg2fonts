const FileSystem = require('fs');
const Path = require('path');

const readDir = promisify(FileSystem.readdir);
const fileStat = promisify(FileSystem.stat);

function promisify(nodeFunction) {
    return function(...args) {
        return new Promise((resolve, reject) => {
            nodeFunction(...args, function(err, data) {
                if(err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            })
        });
    };
}

function readDirDeep(dir) {
    return readDir(dir).then(files => files.map(file => {
        let path = Path.join(dir, file);
        return fileStat(path).then(stat => stat.isDirectory() ? readDirDeep(path) : path);
    }))
        .then(result => Promise.all(result))
        .then(files => Array.prototype.concat(...files));
}


module.exports = {readDirDeep};