const os = require('os');
const path = require('path');
const delay = require('delay');
const tar = require('tar');
const fs = require('fs-extra');
const { exec } = require('child-process-promise');
const autoBind = require('auto-bind');
const AWS = require('aws-sdk');

class Cacti {
  constructor(bucket = '', config = {}) {
    // allow config as first argument
    if (typeof bucket === 'object') config = bucket;

    // set initial config
    this.config = Object.assign(
      {
        // s3 base directory
        directory: 'cacti',
        // s3 directory for mongo backup
        mongoDirectory: 'mongo',
        // s3 directory for redis backup
        redisDirectory: 'redis',
        // mongorestore options/flags
        mongo: '',
        // redis-cli options/flags
        redis: '',
        // platform specific path to redis.conf
        redisConfPath:
          os.platform() === 'darwin'
            ? '/usr/local/etc/redis.conf'
            : '/etc/redis/redis.conf',
        // ms to check bgsave completed
        redisBgSaveCheckInterval: 300,
        // aws configuration object to pass to aws-sdk
        aws: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      },
      config
    );

    //
    // validate bucket is set with optional fallback
    //

    if (
      typeof bucket === 'object' &&
      typeof this.config.aws === 'object' &&
      typeof this.config.aws.params === 'object' &&
      typeof this.config.aws.params.Bucket === 'string'
    )
      bucket = this.config.aws.params.Bucket;

    this.bucket = bucket;

    // ensure directory
    if (typeof this.config.directory !== 'string')
      throw new Error('Directory name `directory` must be a String');

    // ensure trailing slash
    if (this.config.directory.charAt(this.config.directory.length - 1) !== '/')
      this.config.directory += '/';

    // remove starting slash
    if (this.config.directory.charAt(0) === '/')
      this.config.directory = this.config.directory.substring(1);

    // prohibit --gzip flag
    if (this.config.mongo.indexOf('--gzip') !== -1)
      throw new Error('gzip flag is unnecessary, please remove it');

    // prohibit --archive flag
    if (this.config.mongo.indexOf('--archive') !== -1)
      throw new Error('archive flag is unnecessary, please remove it');

    // prohibit -o or --out
    if (
      this.config.mongo.indexOf('-o') !== -1 ||
      this.config.mongo.indexOf('--out') !== -1
    )
      throw new Error('output flag is unnecessary, please remove it');

    autoBind(this);
  }

  backup(tasks = ['mongo', 'redis']) {
    return Promise.all(
      tasks.map(prop => {
        return new Promise(async (resolve, reject) => {
          try {
            let filePath = await this[prop]();
            filePath = await this.tar(filePath);
            const res = await this.upload(
              this.config[`${prop}Directory`],
              filePath
            );
            resolve(res);
          } catch (err) {
            reject(err);
          }
        });
      })
    );
  }

  upload(dir, filePath) {
    return new Promise(async (resolve, reject) => {
      try {
        // ensure bucket name is set
        if (typeof this.bucket !== 'string' || this.bucket.trim() === '')
          throw new Error('S3 bucket name argument `bucket` is required');

        // ensure aws keys are set
        if (typeof this.config.aws !== 'object')
          throw new Error('AWS config must be an object');

        if (typeof this.config.aws.accessKeyId !== 'string')
          throw new Error('AWS access key ID was missing');

        if (typeof this.config.aws.secretAccessKey !== 'string')
          throw new Error('AWS secret access key was missing');

        // setup s3 instance
        const s3 = new AWS.S3(this.config.aws);
        const params = {
          Bucket: this.bucket,
          Key: `${this.config.directory}${dir}/${path.basename(filePath)}`,
          ACL: 'private',
          Body: fs.createReadStream(filePath),
          ServerSideEncryption: 'AES256'
        };
        const res = await s3.upload(params).promise();
        await fs.remove(filePath);
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
  }

  tar(dir) {
    return new Promise(async (resolve, reject) => {
      try {
        const file = `${os.tmpdir()}/${path.basename(dir)}.tgz`;
        await tar.c({ gzip: true, file, cwd: path.dirname(dir) }, [
          path.basename(dir)
        ]);
        await fs.remove(dir);
        resolve(file);
      } catch (err) {
        reject(err);
      }
    });
  }

  mongo() {
    return new Promise(async (resolve, reject) => {
      try {
        const dir = path.join(__dirname, new Date().toISOString());
        await exec(`mongodump ${this.config.mongo} --out=${dir}`);
        resolve(dir);
      } catch (err) {
        reject(err);
      }
    });
  }

  getRedisBgSaveFilePath(lastSave) {
    return new Promise(async (resolve, reject) => {
      try {
        await delay(this.config.redisBgSaveCheckInterval);

        const { stdout } = await exec(
          `echo lastsave | redis-cli ${this.config.redis}`
        );

        const unixTime = parseInt(stdout.replace(/\D/g, ''), 10);
        if (unixTime < lastSave) return this.getRedisBgSaveFilePath(lastSave);
        resolve(
          `${os.tmpdir()}/${new Date(unixTime * 1000).toISOString()}.dump.rdb`
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  redis() {
    return new Promise(async (resolve, reject) => {
      try {
        // attempt to read redis conf path
        const conf = await fs.readFile(this.config.redisConfPath, 'utf8');
        const rdbFileName = conf
          .substring(conf.indexOf('\ndbfilename'))
          .split('\n')[1]
          .split(' ')[1];
        const rdbDirectory = conf
          .substring(conf.indexOf('\ndir'))
          .split('\n')[1]
          .split(' ')[1];
        const rdbFilePath = path.join(rdbDirectory, rdbFileName);
        let lastSave = await exec(
          `echo lastsave | redis-cli ${this.config.redis}`
        );
        lastSave = parseInt(lastSave.stdout.replace(/\D/g, ''), 10);
        await exec(`echo bgsave | redis-cli ${this.config.redis}`);
        const filePath = await this.getRedisBgSaveFilePath(lastSave);
        await fs.copy(rdbFilePath, filePath);
        resolve(filePath);
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = Cacti;
