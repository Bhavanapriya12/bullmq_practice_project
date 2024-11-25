const { object } = require("joi");
const mongoose = require("mongoose");

const stats_schema = new mongoose.Schema(
  {
    biller_id: { type: String, required: true, unique: true, index: true },
    biller_name: { type: String },
    description: { type: String },
    category: { type: String },
    status: { type: String },
    type: { type: String },
    other_charges: { type: String },
    payload: { type: Object },
  },
  { timestamps: true }
);

const STATS = mongoose.model("STATS", stats_schema);

module.exports = STATS;
