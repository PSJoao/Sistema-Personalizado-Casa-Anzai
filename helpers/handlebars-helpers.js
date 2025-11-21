const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const platformLabels = {
    mercado_livre: 'Mercado Livre'
};

const helpers = {
    eq: (v1, v2) => v1 === v2,

    neq: (v1, v2) => v1 !== v2,

    or: (...args) => {
        args.pop();
        return args.some(Boolean);
    },

    json: (context) => {
        return JSON.stringify(context);
    },

    lookup: (obj, field) => obj && obj[field],

    length: (collection) => {
        if (Array.isArray(collection)) {
            return collection.length;
        }
        return 0;
    },

    formatCurrency: (value) => {
        if (value === null || value === undefined || value === '') {
            return '0,00';
        }

        const num = Number(value);
        if (Number.isNaN(num)) {
            return '0,00';
        }

        return currencyFormatter.format(num);
    },

    formatDate: (value) => {
        if (!value) {
            return '-';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '-';
        }

        return date.toLocaleDateString('pt-BR');
    },

    platformLabel: (platformKey) => {
        if (!platformKey) {
            return '-';
        }

        return platformLabels[platformKey] || platformKey;
    },

    sum: (collection, field) => {
        if (!Array.isArray(collection)) {
            return 0;
        }
        
        return collection.reduce((total, item) => {
            const value = Number(item[field]) || 0;
            return total + value;
        }, 0);
    },

    json: (context) => {
        try {
            return JSON.stringify(context ?? {});
        } catch (error) {
            return '{}';
        }
    }
};

module.exports = helpers;
