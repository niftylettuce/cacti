# cacti

[![build status](https://img.shields.io/travis/niftylettuce/cacti.svg)](https://travis-ci.org/niftylettuce/cacti)
[![code coverage](https://img.shields.io/codecov/c/github/niftylettuce/cacti.svg)](https://codecov.io/gh/niftylettuce/cacti)
[![code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![made with lass](https://img.shields.io/badge/made_with-lass-95CC28.svg)](https://lass.js.org)
[![license](https://img.shields.io/github/license/niftylettuce/cacti.svg)](LICENSE)

> :cactus: Extremely simple MongoDB/Redis backups to Amazon S3 with encryption and compression


## Table of Contents

* [Install](#install)
  * [CLI](#cli)
  * [API](#api)
* [Usage](#usage)
  * [Redis Permission Requirements](#redis-permission-requirements)
  * [CLI](#cli-1)
  * [API](#api-1)
* [Options](#options)
  * [CLI](#cli-2)
  * [API](#api-2)
* [Integrations](#integrations)
  * [Agenda](#agenda)
  * [Kue](#kue)
  * [cron](#cron)
  * [crontab](#crontab)
* [Amazon Glacier](#amazon-glacier)
* [Frequently Asked Questions](#frequently-asked-questions)
  * [How do I download and restore a backup](#how-do-i-download-and-restore-a-backup)
  * [How does it work](#how-does-it-work)
* [References](#references)
* [Contributors](#contributors)
* [License](#license)


## Install

### CLI

Coming soon

### API

[npm][]:

```sh
npm install cacti
```

[yarn][]:

```sh
yarn add cacti
```


## Usage

### Redis Permission Requirements

You must ensure that the user running the CLI or interacting with the API has permission to access your Redis database backup file path.

Note that if you have changed the paths below from the defaults provided then you'll need to adjust them.

* Mac: You don't need to do anything (assuming you installed Redis with `brew install redis` and have default permissions setup)

* Ubuntu: Run the commands below and replace `user` with your currently logged in username (type `whoami` to get this)

  ```sh
  sudo chown redis:redis /var/lib/redis/dump.rdb
  sudo chmod 660 /var/lib/redis/dump.rdb
  sudo usermod -a -G redis user
  ```

### CLI

Coming soon

### API

> If you want to backup all databases:

```js
const Cacti = require('cacti');

const cacti = new Cacti('my-s3-bucket-name');

// backup mongo and redis and upload to amazon s3
cacti.backup().then(console.log).catch(console.error);

// simply run mongorestore to create a mongo backup file
cacti.mongo().then(console.log).catch(console.error);

// simply run bgsave to create a redis backup file
cacti.redis().then(console.log).catch(console.error);
```

> If you want to backup only a specific database:

```js
const Cacti = require('cacti');
const cacti = new Cacti('my-s3-bucket-name', { mongo: '--db=some_database' });
cacti.backup().then(console.log).catch(console.error);
```

#### new Cacti(bucket, options)

Note that you can also create a new Cacti instance with just `new Cacti(options)` (but make sure you specify `options.aws.params.Bucket` if so).

By default if you do not specify a bucket name it will throw an error.

#### cacti.backup(tasks)

Returns a `Promise` that resolves with the S3 upload response or rejects with an `Error` object.

The argument `tasks` is an optional Array and defaults to `[ 'mongo', 'redis' ]`.

By default, this method runs `cacti.mongo()`, `cacti.redis()`, and for each it then runs `cacti.tar()` and `cacti.upload()`.

#### cacti.mongo()

Returns a `Promise` that resolves with the file path to the MongoDB backup or rejects with an `Error` object.

#### cacti.redis()

Returns a `Promise` that resolves with the file path to the Redis backup or rejects with an `Error` object.

#### cacti.upload(dir, filePath)

Return a `Promise` that resolves with the S3 upload response or rejects with an `Error` object.

This method is used by `cacti.backup()`. It will automatically remove the `dir` argument from the filesystem.

#### cacti.tar(dir)

Returns a `Promise` that resolves with the file path to the gzipped tarball of `dir`.

This method is used by `cacti.backup()`. It will automatically remove the `dir` argument from the filesystem.

#### cacti.getRedisBgSaveFilePath(lastSave)

Returns a `Promise` that resolves with a temporary file path to copy the RDB file to.

The argument `lastSave` is a UNIX TIME parsed from [bgsave][] which is used for comparison to the [lastsave][].

This temporary file path contains an ISO-8601 file name based upon `redis-cli` command output from `lastsave`.

This method is used by `cacti.redis()` in combination with the option `redisBgSaveCheckInterval`.


## Options

The default option values are provided below, and can be overridden through both the CLI and API.

The only required option is `bucket` (but this is only checked in the `upload` method), which is the Amazon S3 bucket name you'll upload backups to.

Note that your AWS access key ID and secret access key are required as well, but we inherit the standardized values from `process.env.AWS_ACCESS_KEY_ID` and `process.env.AWS_SECRET_ACCESS_KEY` respectively. If those environment variables are not set you will either need to set them, pass them before running `cacti`, or specify them through the API options below.

### CLI

Coming soon

### API

> Options are passed when creating a new `Cacti(bucket, options)` instance (options are in camelCased format)

```sh
const cacti = new Cacti('bucket', {
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
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});
```


## Integrations

> All examples below show how to create a backup every hour.

### [Agenda][]

```js
const Cacti = require('cacti');
const Agenda = require('agenda');

const cacti = new Cacti('my-s3-bucket-name');
const agenda = new Agenda();

agenda.define('backup', async (job, done) => {
  try {
    await cacti.backup();
    done();
  } catch (err) {
    done(err);
  }
});

agenda.every('hour', 'backup');
```

### [Kue][]

> You might want to use [kue-scheduler][] to make scheduling jobs easier

```js
const Cacti = require('cacti');
const kue = require('kue');

const queue = kue.createQueue();
const cacti = new Cacti('my-s3-bucket-name');

queue.process('backup', async (job, done) => {
  try {
    await cacti.backup();
    done();
  } catch (err) {
    done(err);
  }
});

setInterval(() => {
  queue.create('backup').save();
}, 1000 * 60 * 60);
```

### [cron][]

```js
const { CronJob } = require('cron');

new CronJob('0 * * * *', async () => {
  try {
    await cacti.backup();
  } catch (err) {
    console.error(err);
  }
}, null, true);
```

### crontab

> NOTE: This will not work until the CLI is released

1. Schedule a cron job:

```sh
crontab -e
```

2. Add a new line:

```sh
# run cacti every day at midnight to backup mongo/redis
0 0 * * * /bin/bash cacti backup --bucket 'my-s3-bucket-name'
```


## Amazon Glacier

You will probably want to configure Amazon S3 to automatically archive to Amazon Glacier after a period of time.

See <https://aws.amazon.com/blogs/aws/archive-s3-to-glacier/> for more information.


## Frequently Asked Questions

### How do I download and restore a backup

You can download a backup from the [Amazon S3 console][s3] or use [awscli][].

#### MongoDB

You can use simply use the `mongorestore` command.

1. Stop your mongo server:

* Mac: `brew services stop mongo`
* Ubuntu: `sudo systemctl stop mongo`

2. Download your backup from Amazon S3:

```sh
wget -O mongo-backup.tar https://s3.amazonaws.com/my-bucket/xx-xx-xxxx-xx:xx:xx.tar
tar xvf mongo-backup.tar
```

3. Import the backup to MongoDB:

```sh
mongorestore
```

4. Start your mongo server:

* Mac: `brew services start mongo`
* Ubuntu: `sudo systemctl start mongo`

#### Redis

1. Stop your redis server:

* Mac: `brew services stop redis`
* Ubuntu: `sudo systemctl stop redis-server`

2. Download your backup from Amazon S3:

```sh
wget -O redis-backup.tar https://s3.amazonaws.com/my-bucket/xx-xx-xxxx-xx:xx:xx.tar
tar xvf redis-backup.tar
```

3. Move the extracted `dump.rdb` file:

```sh
mv dump.rdb /var/lib/redis/dump.rdb
```

4. Ensure permissions are set properly for `redis` user:

```sh
chown redis:redis /var/lib/redis/dump.rdb
```

5. Start your redis server:

* Mac: `brew services start redis`
* Ubuntu: `sudo systemctl start redis-server`

### How does it work

#### MongoDB

Cacti uses `mongodump` for creating backups.

<https://docs.mongodb.com/manual/reference/program/mongodump/>

#### Redis

Cacti uses `redis-cli` with the `bgsave` command for creating backups.

<https://redis.io/commands/bgsave>

#### Amazon S3

Cacti uses `aws-sdk` and uploads to S3 a gzipped tarball using server-side AES256 encryption.

<https://github.com/aws/aws-sdk-js>


## References

* <https://github.com/hex7c0/mongodb-backup>
* <https://github.com/Percona-Lab/mongodb_consistent_backup>
* <https://www.percona.com/blog/2016/07/25/mongodb-consistent-backups/>
* <https://github.com/nutboltu/mongodb-backup>
* <https://www.mongodb.com/blog/post/archiving-and-compression-in-mongodb-tools>
* <https://gist.github.com/sheharyarn/0f04c1ba18462cddaaf5>
* <https://github.com/sheharyarn/mongo-sync>
* <https://docs.mongodb.com/v3.0/tutorial/backup-small-sharded-cluster-with-mongodump/>
* <https://docs.mongodb.com/v3.0/reference/program/mongos/#bin.mongos>
* <https://docs.aws.amazon.com/redshift/latest/dg/t_uploading-encrypted-data.html>
* <https://docs.aws.amazon.com/AmazonS3/latest/dev/UsingServerSideEncryption.html>
* <https://github.com/ishanjain28/s3-mongo-backup>
* <https://github.com/SerjoPepper/mongo-s3-backup/blob/master/lib/index.coffee>
* <https://github.com/getstrike/node-db-s3-backup/blob/master/index.js>
* <https://gist.github.com/eladnava/96bd9771cd2e01fb4427230563991c8d>
* <http://zdk.blinkenshell.org/redis-backup-and-restore/>
* <https://www.digitalocean.com/community/tutorials/how-to-back-up-and-restore-your-redis-data-on-ubuntu-14-04>
* <http://gihnius.net/2014/07/57-redis-rdb-snapshot/>
* <https://stackoverflow.com/questions/35745481/redis-cli-with-password>
* <https://github.com/ladjs/nodemailer-base64-to-s3>


## Contributors

| Name           | Website                    |
| -------------- | -------------------------- |
| **Nick Baugh** | <http://niftylettuce.com/> |


## License

[MIT](LICENSE) © [Nick Baugh](http://niftylettuce.com/)


## 

[npm]: https://www.npmjs.com/

[yarn]: https://yarnpkg.com/

[agenda]: https://github.com/agenda/agenda

[kue]: https://github.com/Automattic/kue

[cron]: https://github.com/kelektiv/node-cron

[s3]: https://console.aws.amazon.com/s3/home

[awscli]: https://aws.amazon.com/cli/

[kue-scheduler]: https://github.com/lykmapipo/kue-scheduler

[lastsave]: https://redis.io/commands/lastsave

[bgsave]: https://redis.io/commands/bgsave
