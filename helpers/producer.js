const { Queue, QueueEvents } = require("bullmq");

let queue = new Queue("my-queue", {
  connection: {
    host: process.env.REDIS_URL,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
});


module.exports = {
  add_job: async (name, data) => {
    try {
      const job = await queue.add(name, data, {
        removeOnComplete: true,
        removeOnFail: true,
      });
      console.log("Job added -->", job.data);
      return job;
    } catch (err) {
      console.error(err);
    }
  },
};
