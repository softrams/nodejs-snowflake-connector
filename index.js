/* istanbul ignore file */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-else-return */
const snowflake = require("snowflake-sdk");
const fs = require("fs");
const AWS = require("aws-sdk");

let pools = {};
let config = {};
const genericError = 'An error occurred communicating with the database.';

exports.init = async (cfg) => {
  config = cfg;
};

/**
 * Retrieves private key from AWS Secrets Manager
 * @param {Object} srcCfg - Source configuration object
 * @returns {Promise<string>} Private key string
 * @throws {Error} If private key cannot be found or extracted
 */
const getPrivateKeyFromSecrets = async (srcCfg) => {
  if (!srcCfg.PRIVATE_KEY_SECRET_NAME) {
    throw new Error('PRIVATE_KEY_SECRET_NAME is required but not provided');
  }

  const secretsManager = new AWS.SecretsManager({ 
    region: process.env.AWS_REGION || 'us-east-1',
    apiVersion: '2017-10-17'
  });
  
  const secretResult = await secretsManager.getSecretValue({
    SecretId: srcCfg.PRIVATE_KEY_SECRET_NAME
  }).promise();
  
  if (!secretResult.SecretString) {
    throw new Error(`Secret ${srcCfg.PRIVATE_KEY_SECRET_NAME} does not contain a SecretString`);
  }
  
  let secretData;
  try {
    secretData = JSON.parse(secretResult.SecretString);
  } catch (parseError) {
    throw new Error(`Failed to parse secret ${srcCfg.PRIVATE_KEY_SECRET_NAME} as JSON: ${parseError.message}`);
  }
  
  // Try configured field name only
  const fieldName = srcCfg.PRIVATE_KEY_FIELD_NAME;
  
  if (!fieldName) {
    throw new Error(`PRIVATE_KEY_FIELD_NAME is required when using AWS Secrets Manager for ${srcCfg.PRIVATE_KEY_SECRET_NAME}`);
  }
  
  const privateKey = secretData[fieldName];
  
  if (!privateKey) {
    throw new Error(`Private key not found in secret ${srcCfg.PRIVATE_KEY_SECRET_NAME}. Field '${fieldName}' does not exist. Available fields: ${Object.keys(secretData).join(', ')}`);
  }
  
  if (typeof privateKey !== 'string' || privateKey.trim().length === 0) {
    throw new Error(`Private key found in secret ${srcCfg.PRIVATE_KEY_SECRET_NAME} but it is empty or not a string`);
  }
  
  return privateKey;
};

/**
 * Validates required configuration parameters
 * @param {Object} srcCfg - Source configuration object
 * @param {string} poolName - Pool name for error reporting
 * @returns {string|null} Error message if validation fails, null if valid
 */
const validateConfiguration = (srcCfg, poolName) => {
  if (!srcCfg) {
    return `Missing configuration for ${poolName}`;
  }
  
  const required = ['DB_HOST', 'DB_USER', 'DB_DATABASE', 'SCHEMA'];
  const missing = required.filter(field => !srcCfg[field]);
  
  if (missing.length > 0) {
    return `Missing required configuration fields for ${poolName}: ${missing.join(', ')}`;
  }
  
  // Strict validation for private key authentication
  if (!srcCfg.PRIVATE_KEY_PATH && !srcCfg.PRIVATE_KEY_SECRET_NAME) {
    return `Authentication configuration missing for ${poolName}. Must provide either PRIVATE_KEY_PATH or PRIVATE_KEY_SECRET_NAME`;
  }
  
  // If using AWS Secrets Manager, validate the secret name is not empty
  if (srcCfg.PRIVATE_KEY_SECRET_NAME && !srcCfg.PRIVATE_KEY_SECRET_NAME.trim()) {
    return `PRIVATE_KEY_SECRET_NAME for ${poolName} cannot be empty`;
  }
  
  // If using file path, validate the path is not empty
  if (srcCfg.PRIVATE_KEY_PATH && !srcCfg.PRIVATE_KEY_PATH.trim()) {
    return `PRIVATE_KEY_PATH for ${poolName} cannot be empty`;
  }
  
  return null;
};

/**
 * Builds Snowflake connection options from configuration
 * @param {Object} srcCfg - Source configuration object
 * @returns {Object} Snowflake connection options
 */
const buildConnectionOptions = (srcCfg) => {
  const options = {
    account: srcCfg.DB_HOST,
    username: srcCfg.DB_USER,
    database: srcCfg.DB_DATABASE,
    schema: srcCfg.SCHEMA,
    authenticator: 'SNOWFLAKE_JWT'
  };
  
  // Add optional parameters
  if (srcCfg.PORT) options.port = srcCfg.PORT;
  if (srcCfg.WAREHOUSE) options.warehouse = srcCfg.WAREHOUSE;
  if (srcCfg.ROLE) options.role = srcCfg.ROLE;
  if (srcCfg.PRIVATE_KEY_PASSPHRASE) options.privateKeyPassphrase = srcCfg.PRIVATE_KEY_PASSPHRASE;
  
  return options;
};

exports.createSnowPool = async (poolName) => {
  try {
    console.debug(`Creating Snowflake pool: ${poolName}`);
    const srcCfg = config.DATASOURCES[poolName];
    
    // Validate configuration
    const validationError = validateConfiguration(srcCfg, poolName);
    if (validationError) {
      console.error(`Snowflake Adapter: ${validationError}`);
      return false;
    }
    
    // Build base connection options
    const options = buildConnectionOptions(srcCfg);
    
    // Handle private key authentication
    try {
      if (srcCfg.PRIVATE_KEY_SECRET_NAME) {
        console.debug(`Fetching private key from AWS Secrets Manager: ${srcCfg.PRIVATE_KEY_SECRET_NAME}`);
        options.privateKey = await getPrivateKeyFromSecrets(srcCfg);
        console.debug('Successfully retrieved private key from AWS Secrets Manager');
      } else if (srcCfg.PRIVATE_KEY_PATH) {
        console.debug(`Reading private key from file: ${srcCfg.PRIVATE_KEY_PATH}`);
        options.privateKey = fs.readFileSync(srcCfg.PRIVATE_KEY_PATH, 'utf8');
        console.debug('Successfully read private key from file');
      }
    } catch (err) {
      console.error(`Snowflake Adapter: Error setting up private key authentication: ${err.message}`);
      return false;
    }
    
    // Create the connection pool
    pools[poolName] = snowflake.createPool(options, { 
      max: srcCfg.POOL_MAX || 10, 
      min: srcCfg.POOL_MIN || 0 
    });
    
    console.debug(`Snowflake Adapter: Pool ${poolName} created successfully`);
    return true;
    
  } catch (err) {
    console.error(`Snowflake Adapter: Error while creating connection pool ${poolName}:`, err);
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
