const { Logger, transports } = require("winston");

const winston_options = {
  console: {
    level: process.env.LOG_LEVEL || "error",
    handleExceptions: true,
    timestamp: true,
    json: false,
    colorize: true,
  },
};

const logger = new Logger({
  transports: [new transports.Console(winston_options.console)],
  exitOnError: false, // do not exit on handled exceptions
});
export = logger;
