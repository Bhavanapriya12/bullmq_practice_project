require("dotenv").config();

require("./db")();

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
  transaction: async (data) => {
    console.log("transaction process---->", data);
    let balance = parseFloat(data.balance);

    const bulkOps = [
      {
        updateOne: {
          filter: { user_id: data.sender },
          update: { $inc: { balance: balance } },
        },
      },
      {
        updateOne: {
          filter: { user_id: data.receiver },
          update: { $inc: { balance: balance } },
        },
      },
    ];

    let sender_t_history = {
      t_id: data.T_id,
      status: "success",
      receiver: data.receiver,
      amount: data.balance,
      coin: data.coin,
    };

    let receiver_t_history = {
      t_id: data.T_id,
      status: "success",
      sender: data.sender,
      amount: data.balance,
      coin: data.coin,
    };

    let sender_tf_history = {
      t_id: data.T_id,
      status: "failed",
      receiver: data.receiver,
      amount: data.balance,
      coin: data.coin,
    };

    let receiver_tf_history = {
      t_id: data.T_id,
      status: "failed",
      sender: data.sender,
      amount: data.balance,
      coin: data.coin,
    };

    try {
      const result = await mongoFunctions.bulkWrite("FILES", bulkOps);

      console.log("Money adjusted successfully:", result);

      if (result) {
        await mongoFunctions.bulkWrite("FILES", [
          {
            updateOne: {
              filter: { user_id: data.sender },
              update: { $push: { transaction_history: sender_t_history } },
            },
          },
          {
            updateOne: {
              filter: { user_id: data.receiver },
              update: { $push: { transaction_history: receiver_t_history } },
            },
          },
        ]);
        return {
          success: true,
          message: "Transaction completed successfully!",
        };
      }
    } catch (error) {
      console.error("Error adjusting money:", error);

      await mongoFunctions.bulkWrite("FILES", [
        {
          updateOne: {
            filter: { user_id: data.sender },
            update: { $push: { transaction_history: sender_tf_history } },
          },
        },
        {
          updateOne: {
            filter: { user_id: data.receiver },
            update: { $push: { transaction_history: receiver_tf_history } },
          },
        },
      ]);
      return { success: false, message: "Transaction failed due to an error!" };
    }
  },
};
