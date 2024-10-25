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
    const find_receiver = await mongoFunctions.find_one("FILES", {
      user_id: data.receiver,
    });
    console.log(find_receiver, "find___reciver");

    const find_sender = await mongoFunctions.find_one("FILES", {
      user_id: data.sender,
    });
    if (!find_receiver) {
      return res.status(400).send("Receiver Not Found");
    }
    if (!find_sender) {
      return res.status(400).send("Sender Not Found");
    }
    console.log(find_receiver);
    const bulkOps = [
      {
        updateOne: {
          filter: { user_id: data.sender },
          update: { $inc: { balance: -data.balance } }, // Decrease sender's money
        },
      },
      {
        updateOne: {
          filter: { user_id: data.receiver },
          update: { $inc: { balance: data.balance } }, // Increase receiver's money
        },
      },
    ];

    try {
      const result = await mongoFunctions.bulkWrite("FILES", bulkOps);
      console.log("Money adjusted successfully:", result);
      return true;
    } catch (error) {
      console.error("Error adjusting money:", error);
    }
  },

};
