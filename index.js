/* istanbul ignore file */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-else-return */
const snowflake = require("snowflake-sdk");

let pools = {};
let config = {};
const genericError = 'An error occurred communicating with the database.';

exports.init = async (cfg) => {
  config = cfg;
};

exports.createSnowPool = async (poolName) => {
  try {
    const srcCfg = config.DATASOURCES[poolName];
    if (srcCfg) {
      const options = {
        account: srcCfg.DB_HOST,
        username: srcCfg.DB_USER,
        password: srcCfg.DB_PASSWORD,
        database: srcCfg.DB_DATABASE,
        port: srcCfg.PORT,
        schema: srcCfg.SCHEMA
      };

      pools[poolName] = snowflake.createPool(options, { max: 10, min: 0 });
      console.debug(`Snowflake Adapter: Pool ${poolName} created`);
      return true;
    } else {
      console.error(`Snowflake Adapter: Missing configuration for ${poolName}`);
      return false;
    }
  } catch (err) {
    console.error("Snowflake Adapter: Error while closing connection", err);
    return false;
  }
};

exports.connect = async (poolName) => {
  try {
    if (!pools[poolName]) {
      await this.createSnowPool(poolName);
    }
    return pools[poolName];
  } catch (err) {
    console.error("Snowflake Adapter: Error while retrieving a connection", err);
    throw new Error(err.message);
  }
};

this.query = async (conn, query, params) => {
  return new Promise((resolve, reject) => {
    try {
      conn.use( async (clientConnection) => {
        await clientConnection.execute({
          sqlText: query,
          binds: params ? params : [],
          complete: async (err, stmt, rows) => {
            if (err) {
              console.error("Failed to execute statement due to the following error: " + err.message);
              reject();
            } else {
              console.log("Successfully executed statement: " + stmt.getSqlText());
              resolve(rows);
            }
          }
        })
      });
    } catch (err) {
      console.error("Snowflake Adapter:  Failure in query: ", err);
      this.handleError(reject, err);
    }
  });
};

this.handleError = (reject, error) => {
  const errorReturn = (config && config.HIDE_DB_ERRORS) ? new Error(genericError) : error;
  reject(errorReturn);
};

exports.execute = async (srcName, query, params = {}) => {
  try {
    console.debug(query);
    if (params) {
      console.debug(JSON.stringify(params));
    }

    const start = process.hrtime();
    const conn = await this.connect(srcName);

    console.debug(
      `Snowflake Adapter: Connection secured: ${process.hrtime(start)[0]}s ${
        process.hrtime(start)[1] / 1000000
      }ms`
    );
    const results = await this.query(conn, query, params);

    console.debug(
      `Snowflake Adapter: Query executed: ${process.hrtime(start)[0]}s ${
        process.hrtime(start)[1] / 1000000
      }ms`
    );

    return results;
  } catch (err) {
    console.error("Snowflake Adapter: Error while executing query", err);
    throw new Error(err.message);
  }
};

exports.closeAllPools = async () => {
  try {
    for (const poolAlias of Object.keys(pools)) {
      await this.closePool(poolAlias);
      delete pools[poolAlias];
      console.debug(`Snowflake Adapter: Pool ${poolAlias} closed`);
    }
    return true;
  } catch (err) {
    console.error("Snowflake Adapter: Error while closing connection", err);
    return false;
  }
};

exports.closePool = async (poolAlias) => {
  try {
    if (pools[poolAlias]) {
      const poolConn = pools[poolAlias];
      delete pools[poolAlias];
      await poolConn.end((err) => {
        if (err) {
          console.error(
            `Error while closing connection pool ${poolAlias}`,
            err
          );
        }
      });
      return true;
    } else {
      return true;
    }
  } catch (err) {
    console.error("Snowflake Adapter: Error while closing connection", err);
    return false;
  }
};
