const express = require("express");
const mongoFunctions = require("../../helpers/mongoFunctions");
const router = express.Router();
const validations = require("../../helpers/schema");
const functions = require("../../helpers/functions");
const queue_job = require("../../helpers/producer");
const worker = require("../../helpers/consumer");
const redis = require("../../helpers/redisFunctions");
const { Auth } = require("../../middlewares/auth");
const bcrypt = require("../../helpers/hash");
const jwt = require("jsonwebtoken");

router.post("/user_register", async (req, res) => {
  const { error, value } = validations.user_register(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  let data = value;
  let email = await mongoFunctions.find_one("FILES", { email: data.email });
  if (email) {
    return res.status(400).send("Email Already Exists");
  }
  let password = bcrypt.hash_password(data.password);
  const user = {
    user_id: functions.get_random_string("PU", 5),
    email: data.email.toLowerCase(),
    username: data.username,
    balance: data.balance,
    password: password,
  };
  let users = await mongoFunctions.create_new_record("FILES", user);
  await redis.update_redis("FILES", users);
  return res.status(200).send("User Registered Successfully");
});

router.post("/user_login", async (req, res) => {
  let data = req.body;
  console.log(data);
  //validate data
  var { error } = validations.user_login(data);
  if (error) return res.status(400).send(error.details[0].message);
  const user = await mongoFunctions.find_one("FILES", {
    email: data.email.toLowerCase(),
  });
  if (!user) return res.status(400).send("No User Found With The Given Email");
  const validPassword = await bcrypt.compare_password(
    data.password,
    user.password
  );
  console.log(validPassword);
  console.log(user.password);
  if (!validPassword) return res.status(400).send("Incorrect Password");

  const token = jwt.sign(
    {
      user_id: user.user_id,
      email: user.email,
      username: user.username,
    },
    process.env.jwtPrivateKey,
    { expiresIn: "7d" }
  );
  console.log(token);

  return res.status(200).send({
    success: "Logged In Successfully",
    token: token,
  });
});
router.post("/user_payment", Auth, async (req, res) => {
  const { error, value } = validations.payment(req.body);
  if (error) return res.status(400).send(error.details[0].message);

  let data = value;
  let sender = req.employee.user_id;
  let receiver = data.receiver_user_id;
  let balance = data.balance;
  balance = balance.toFixed(8);
  let transaction_fee = 1;

  let coin = data.coin;
  const find_receiver = await mongoFunctions.find_one("FILES", {
    user_id: receiver,
  });
  console.log(find_receiver, "find___receiver");

  const find_sender = await mongoFunctions.find_one("FILES", {
    user_id: sender,
  });

  if (!find_receiver) {
    return res.status(400).send("Receiver Not Found");
  }

  if (!find_sender) {
    return res.status(400).send("Sender Not Found");
  }

  console.log(find_receiver);

  if (find_sender.balance < data.balance) {
    return res.status(400).send("Insufficient Balance..!");
  }
  const T_id = functions.get_random_string("TR", 8);
  console.log(T_id);

  const job = await queue_job.add_job(
    "payment",
    {
      T_id,
      coin,
      sender,
      receiver,
      balance,
      transaction_fee,
    }
    // {
    //   timeout: 5000,
    // }
  );
  // let status = await mongoFunctions.find_one("HISTORY", { t_id: T_id });
  // if (status.status === "success") {
  //   return res
  //     .status(200)
  //     .send({ message: "Payment Success..", payment_id: data.T_id });
  // }
  // if (status.status === "failed") {
  //   return res
  //     .status(200)
  //     .send({ message: "Payment Failed..", payment_id: data.T_id });
  // }

  return res
    .status(200)
    .send({ message: "Payment Processing..", payment_id: data.T_id });
});

router.post("/get_payment_result", async (req, res) => {
  const { error, value } = validations.get_payment(req.body);
  if (error) {
    return res.status(400).send(error.details[0].message);
  }

  const data = value;

  try {
    const findId = await mongoFunctions.find_one("FILES", {
      "transaction_history.t_id": data.id,
    });

    if (!findId) {
      return res.status(400).send("Transaction ID doesn't exist.");
    }

    console.log(findId);

    // Find the specific transaction in the array
    const history = findId.transaction_history.find(
      (transaction) => transaction.t_id === data.id
    );

    if (!history) {
      return res.status(400).send("Transaction history not found.");
    }

    if (history.status === "success") {
      return res.status(200).send("Payment done successfully!");
    } else if (history.status === "failed") {
      return res.status(400).send("Payment failed.");
    } else {
      return res.status(400).send("Unknown payment status.");
    }
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .send("An error occurred while processing your request.");
  }
});

module.exports = router;
