const mongoose = require('mongoose');

const transferLimitConfigSchema = new mongoose.Schema(
  {
    perTransactionLimit: {
      type: Number,
      required: [true, 'Per-transaction limit is required'],
      default: 50000,
      min: [1, 'Per-transaction limit must be greater than 0'],
    },
    dailyAmountLimit: {
      type: Number,
      required: [true, 'Daily amount limit is required'],
      default: 100000,
      min: [1, 'Daily amount limit must be greater than 0'],
    },
    dailyCountLimit: {
      type: Number,
      required: [true, 'Daily transaction count limit is required'],
      default: 20,
      min: [1, 'Daily count limit must be at least 1'],
    },
    beneficiaryCooldownMinutes: {
      type: Number,
      required: [true, 'Beneficiary cooldown period is required'],
      default: 30,
      min: [0, 'Cooldown period cannot be negative'],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Singleton retrieval helper
 */
transferLimitConfigSchema.statics.getConfig = async function (session = null) {
  const query = this.findOne();
  if (session) {
    query.session(session);
  }
  let config = await query;
  if (!config) {
    const envPerTx = Number(process.env.PER_TRANSACTION_LIMIT) || 50000;
    const envDailyAmt = Number(process.env.DAILY_AMOUNT_LIMIT) || 100000;
    const envDailyCount = Number(process.env.DAILY_COUNT_LIMIT) || 20;
    const envCooldown = process.env.BENEFICIARY_COOLDOWN_MINUTES !== undefined
      ? Number(process.env.BENEFICIARY_COOLDOWN_MINUTES)
      : 30;

    const createOptions = session ? { session } : {};
    const created = await this.create(
      [
        {
          perTransactionLimit: envPerTx,
          dailyAmountLimit: envDailyAmt,
          dailyCountLimit: envDailyCount,
          beneficiaryCooldownMinutes: isNaN(envCooldown) ? 30 : envCooldown,
        },
      ],
      createOptions
    );
    config = created[0];
  }
  return config;
};

const transferLimitConfigModel = mongoose.model('TransferLimitConfig', transferLimitConfigSchema);

module.exports = transferLimitConfigModel;
