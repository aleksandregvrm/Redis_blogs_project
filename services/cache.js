const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');

const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.hget = util.promisify(client.hget);
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function(options={}){
    this.useCache = true;
    this.hashkey = JSON.stringify(options.key || 'default');

    return this
}

mongoose.Query.prototype.exec = async function(){
    // We Should return a mongoose document here not a plain JSON data
    if (!this.useCache) {
      return exec.apply(this, arguments);
    }

    const key = JSON.stringify(
      Object.assign({}, this.getQuery(), {
        collection: this.mongooseCollection.name,
      })
    );

    // See if we have a value for 'key' in redis
    const cacheValue = await client.hget(this.hashkey,key);

    // If we do, return that
    if (cacheValue) {
      const doc = JSON.parse(cacheValue);
      console.log('getting the cached values');
      return Array.isArray(doc)
        ? doc.map((d) => new this.model(d))
        : new this.model(doc);
    }

    // Otherwise, issue the query and store the result in redis
    const result = await exec.apply(this, arguments);
    console.log('getting the mongo values');
    client.hset(this.hashkey,key,JSON.stringify(result),"EX",10);

    return result;
};

module.exports = {
  clearHash(hashkey){
    client.del(JSON.stringify(hashkey));
  }
}