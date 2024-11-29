const mongoose = require("mongoose");

const data_schema = new mongoose.Schema(
  {
    // data: { type: Array, default: [] },
    tpa_id: { type: String, default: "" },
    sequence: { type: Number, default: "" },
  },
  { timestamps: true }
);

const DATA = mongoose.model("DATA", data_schema);

module.exports = DATA;
