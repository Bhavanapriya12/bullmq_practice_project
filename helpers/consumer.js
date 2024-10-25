const { Worker } = require("bullmq");

const functions = require("./functions");

const connection = {
  host: process.env.REDIS_URL,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
};
console.log("connection-->", connection);

const worker = new Worker(
  "my-queue",
  async (job) => {
    console.log("job-----------ooooodata-->", job);
    if (job.name === "payment") {
      console.log("job started");
      const jobresponse = await functions.transaction(job.data);
      console.log("jobresponse--->", jobresponse);

      console.log(`${job.name}--->completed`);
    } else {
      console.log("job--->", job);
    }
  },
  {
    connection: {
      host: process.env.REDIS_URL,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    },
  }
);

// Listen for completed jobs
worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
  return true;
});

// Listen for failed jobs
worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed with error: ${err}`);
  return true;
});
