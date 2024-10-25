const express = require("express");
const mongoFunctions = require("../../helpers/mongoFunctions");
const router = express.Router();
const validations = require("../../helpers/schema");
const functions = require("../../helpers/functions");
const queue = require("../../helpers/producer");
const worker=require("../../helpers/consumer");

router.post("/user_register", async (req, res) => {
  const { error, value } = validations.user_register(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  let data = value;
  const user = {
    user_id: functions.get_random_string("PU", 5),
    email: data.email,
    username: data.username,
    balance: data.balance,
  };
  await mongoFunctions.create_new_record("FILES", user);
  return res.status(200).send("User Registered Successfully");
});
router.post("/user_payment", async (req, res) => {
  const { error, value } = validations.payment(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  let data = value;

  let sender = data.sender_user_id;
  let receiver = data.receiver_user_id;
  let balance = data.balance;

  await queue.add_job("payment", { sender, receiver, balance });
  // await worker.

  return res.status(200).send("Transaction Processed Successfully..!");
});

module.exports = router;
