const { array, required } = require("joi");
const mongoose = require("mongoose");

const user_schema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, index: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    // balance: { type: Number, required: true },
    balance: {
      type: Number,
      required: true,
    },
    transaction_history: { type: Array, default: [] },
  },
  { timestamps: true }
);

user_schema.index({ user_id: 1, email: 1 });

const FILES = mongoose.model("FILES", user_schema);

module.exports = FILES;
