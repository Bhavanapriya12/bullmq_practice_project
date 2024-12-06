require("dotenv").config();
const moment = require("moment");
const { api_token } = require("../routes/payment_routes/billers");

require("./db")();
const redis = require("./redisFunctions");

const crypto = require("crypto");
const mongoFunctions = require("./mongoFunctions");

module.exports = {
  get_random_string: (str, length, pre_append = false) => {
    if (str === "0")
      return crypto
        .randomBytes(Number(length / 2))
        .toString("hex")
        .toUpperCase();
    else if (pre_append) {
      return (
        str +
        crypto
          .randomBytes(Number(length / 2))
          .toString("hex")
          .toUpperCase()
      );
    }
    return (
      crypto
        .randomBytes(Number(length / 2))
        .toString("hex")
        .toUpperCase() + str
    );
  },
  refund_amount: async (user_id, balance) => {
    let user = await mongoFunctions.find_one("FILES", { user_id: user_id });
    const balance_r = parseFloat(balance);
    if (!user) {
      return False;
    }
    await mongoFunctions.find_one_and_update(
      "FILES",
      { user_id: user_id },
      { $inc: { balance: +balance_r } }
    );
    return True;
  },

  transaction: async (data) => {
    const TRANSACTION_STATUS = {
      SUCCESS: "success",
      FAILED: "failed",
    };

    console.log("Transaction process---->", data);

    const balance = data.balance + data.transaction_fee;
    // balance = balance.toFixed(8);
    console.log(data.transaction_fee);
    console.log(balance);

    try {
      const sender = await mongoFunctions.find_one_and_update(
        "FILES",
        { user_id: data.sender },
        { $inc: { balance: -balance } }
      );
      await redis.update_redis("FILES", sender);

      const receiver = await mongoFunctions.find_one_and_update(
        "FILES",
        { user_id: data.receiver },
        { $inc: { balance: +data.balance } }
      );
      await redis.update_redis("FILES", receiver);
      if (sender && receiver) {
        // if (!sender) {
        //   res.status(400).send("Sender Not Found");
        // }
        // if (!receiver) {
        //   res.status(400).send("Receiver Not Found.");
        // }

        const transactionHistoryReceiver = [
          {
            user_id: data.receiver,
            t_id: data.T_id,
            sender: data.sender,
            status: TRANSACTION_STATUS.SUCCESS,
            amount: data.balance,
            coin: data.coin,
            payment_type: "credit",
          },
        ];
        const transactionHistorySender = [
          {
            user_id: data.sender,
            t_id: data.T_id,
            status: TRANSACTION_STATUS.SUCCESS,
            receiver: data.receiver,
            amount: balance,
            coin: data.coin,
            payment_type: "debit",
            transaction_fee: data.transaction_fee,
          },
        ];

        await mongoFunctions.insert_many_records("HISTORY", [
          ...transactionHistoryReceiver,
          ...transactionHistorySender,
        ]);

        return {
          success: true,
          message: "Transaction completed successfully!",
        };
      }
    } catch (error) {
      console.error("Error during transaction:", error.message);

      const failureHistorySender = {
        user_id: data.sender,
        t_id: data.T_id,
        status: TRANSACTION_STATUS.FAILED,
        amount: data.balance,
        coin: data.coin,
        receiver: data.receiver,
        payment_type: "debit",
      };
      const failureHistoryReceiver = {
        user_id: data.receiver,
        t_id: data.T_id,
        status: TRANSACTION_STATUS.FAILED,
        amount: data.balance,
        coin: data.coin,
        sender: data.sender,
        payment_type: "credit",
      };

      await mongoFunctions.insert_many_records(
        "HISTORY",
        ...failureHistorySender,
        ...failureHistoryReceiver
      );

      return {
        success: false,
        message: "Transaction failed: " + error.message,
      };
    }
  },
};
