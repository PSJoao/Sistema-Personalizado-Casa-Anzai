const helpers = {
    eq: (v1, v2) => v1 === v2,

    neq: (v1, v2) => v1 !== v2,

    lookup: (obj, field) => obj && obj[field],
};

module.exports = helpers;
