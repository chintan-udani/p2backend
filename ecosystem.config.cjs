// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "app",
      script: "index.js",
      interpreter: "/home/rocky/.nvm/versions/node/v24.9.0/bin/node",
      env: {
        PATH: `/home/rocky/.nvm/versions/node/v24.9.0/bin:${process.env.PATH}`,
        NODE_ENV: "production",
      },
    },
  ],
};
