var RedisClient = require("redis");
const mongofunctions = require("./mongoFunctions");
let client;

if (process.env.REDIS_URL) {
  client = RedisClient.createClient({
    url: `redis://${process.env.REDIS_URL}:${process.env.REDIS_PORT}`,
    password: process.env.REDIS_PASSWORD,
  });
}
// alertDev(process.env.REDIS_URL);

client.on("error", (err) => {
  console.log("redis err--->", err);
});
client.on("connect", (connect) => {
  console.log("redis 🧨 connected");
});
client.connect();

module.exports = {
  //----------------custom redis functions----------
  update_redis: async (COLLECTION, obj, from_mongo = false, key = false) => {
    if (from_mongo && key) {
      find_user = await mongofunctions.find_one(COLLECTION, {
        [key]: obj[key],
      });
      if (find_user) {
        obj = find_user;
        console.log("found");
      } else {
        console.log("update redis else------------>");
      }
    }
    if (COLLECTION === "ADMIN") {
      obj.password = undefined;
      obj.two_fa_key = undefined;
      obj._id = undefined;
      obj.__v = undefined;
      obj.fcm_token = undefined;
      obj.others = undefined;
      obj.updatedAt = undefined;
      obj.browser_id = undefined;
      await client.hSet(
        "CRM_ADMIN",
        obj.userid,
        JSON.stringify(obj),
        (err, res) => {}
      );
      return true;
    } else if (COLLECTION === "ADMIN_CONTROLS") {
      obj._id = undefined;
      obj.__v = undefined;
      obj.createdAt = undefined;
      obj.updatedAt = undefined;
      await client.hSet(
        "CRM_ADMIN_CONTROLS",
        "ADMIN_CONTROLS",
        JSON.stringify(obj),
        (err, res) => {}
      );
      return true;
    } else if (COLLECTION === "USER") {
      obj._id = undefined;
      obj.__v = undefined;
      obj.createdAt = undefined;
      obj.updatedAt = undefined;
      obj.two_fa_key = undefined;
      obj.two_fa_status = undefined;
      obj.others = undefined;
      await client.hSet(
        "CRM_USER",
        obj.userid,
        JSON.stringify(obj),
        (err, res) => {}
      );
      return true;
    } else if (COLLECTION === "ORGANISATIONS") {
      obj._id = undefined;
      obj.__v = undefined;
      obj.createdAt = undefined;
      obj.updatedAt = undefined;
      await client.hSet(
        "CRM_ORGANISATIONS",
        obj.organisation_id,
        JSON.stringify(obj),
        (err, res) => {}
      );
      return true;
    } else if (COLLECTION === "EMPLOYEE") {
      obj._id = undefined;
      obj.__v = undefined;
      obj.images = undefined;
      // obj.createdAt = undefined;
      obj.updatedAt = undefined;
      await client.hSet(
        obj.organisation_id,
        obj.employee_id,
        JSON.stringify(obj),
        (err, res) => {}
      );
      return true;
    }
  },

  genOtp: async (key, value, expire) => {
    await client.setEx(key, expire, value.toString(), (err, res) => {});
  },

  with_expire: async (hash, key, data, expirationInSeconds, parse = true) => {
    if (parse) {
      data = JSON.stringify(data);
    }
    console.log(hash, key, data, expirationInSeconds);
    client.hSet(hash, key, data, (err, reply) => {
      if (err) {
        console.error("Error setting hash field:", err);
        return err;
      }
      console.log("reply---", reply);
      client.expire(
        `${hash} ${key}`,
        expirationInSeconds,
        (expireErr, expireReply) => {
          if (expireErr) {
            console.error("Error setting expiration:", expireErr);
            return err;
          }
          console.log("expireReply---", expireReply);

          console.log(
            `Expiration set successfully for ${hash}:${key}: ${expirationInSeconds} seconds`
          );
        }
      );
    });
  },
  //-----------------redis functions------------------
  redisGet: async (hash, key, parse = false) => {
    let check_exists = await client.hExists(hash, key);
    if (check_exists) {
      var value = await client.hmGet(hash, key);
      if (value) {
        if (parse) {
          value = JSON.parse(value);
        }
        return value;
      } else {
        return false;
      }
    } else {
      return false;
    }
  },

  redisGetSingle: async (key, parse = false) => {
    let check_exists = await client.exists(key);
    if (check_exists) {
      var value = await client.get(key);
      if (value) {
        if (parse) {
          value = JSON.parse(value);
        }
        return value;
      }
      return false;
    }
    return false;
  },
  redisGetAll: async (key, parse = false) => {
    let check_exists = await client.exists(key);
    if (check_exists) {
      var value = await client.hGetAll(key);
      if (value) {
        if (parse) {
          value = JSON.parse(value);
        }
        return value;
      }
      return false;
    }
    return false;
  },

  redisSetSingle: async (hash, data, parse = false) => {
    if (parse) {
      data = JSON.stringify(data);
    }
    var dta = await client.set(hash, data);
    return dta;
  },

  redisInsert: async (hash, key, data, parse = false) => {
    try {
      if (parse) {
        data = JSON.stringify(data);
      }
      return await client.hSet(hash, key, data);
    } catch (err) {
      console.log("err in redis insert", err);
    }
  },
  redisHdelete: async (hash, key) => {
    var dta = await client.hDel(hash, key);
    return dta;
  },
  redisDelete: async (key) => {
    var dta = await client.del(key);
    return dta;
  },
  client,
};