module.exports = {
  apps: [
    {
      name: 'sales-forecast',
      script: './server/app.js',
      env_production: {
        NODE_ENV: 'development',
        PORT: 4000,
        FRONTEND_ORIGIN: 'http://localhost:5173',
      },
    },
  ],
};
