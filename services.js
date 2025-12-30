// Generic Mongo service helpers for controllers/routes reuse
module.exports = {
  async getData(Model, filter = {}, options = {}) {
    const query = Model.find(filter);
    if (options.select) query.select(options.select);
    if (options.sort) query.sort(options.sort);
    if (options.limit) query.limit(options.limit);
    if (options.skip) query.skip(options.skip);
    if (options.populate) query.populate(options.populate);
    if (options.lean) query.lean();
    return await query.exec();
  },

  async getSingleDocument(Model, filter = {}, options = {}) {
    const query = Model.findOne(filter);
    if (options.select) query.select(options.select);
    if (options.populate) query.populate(options.populate);
    if (options.lean) query.lean();
    return await query.exec();
  },

  async addData(Model, payload, options = {}) {
    const doc = new Model(payload);
    return await doc.save(options);
  },

  async addMultipleDocument(Model, payloadArray, options = {}) {
    return await Model.insertMany(payloadArray, options);
  },

  async countDocument(Model, filter = {}) {
    return await Model.countDocuments(filter).exec();
  },
};