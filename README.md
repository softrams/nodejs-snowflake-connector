# Snowflake DB Connector

Database connector wrapper to work with Snowflake database from nodejs applications. Supports key pair authentication with private keys stored in files or AWS Secrets Manager.

## Installation

```bash
npm install @softrams/nodejs-snowflake-connector
```

## Features

- ✅ **Key Pair Authentication** - Secure JWT-based authentication using RSA private keys
- ✅ **AWS Secrets Manager Integration** - Store private keys securely in AWS Secrets Manager
- ✅ **File-based Private Keys** - Load private keys from local files
- ✅ **Connection Pooling** - Efficient connection management with configurable pool settings
- ✅ **Multiple Data Sources** - Support for multiple Snowflake connections in one application
- ✅ **Parameterized Queries** - Safe query execution with parameter binding

## Authentication Methods

This connector **only supports key pair authentication** using RSA private keys. Username/password authentication is not supported.

### Option A: Private Key from File Path
```javascript
const config = {
  DATASOURCES: {
    mySnowflakeDB: {
      DB_HOST: "your-account.snowflakecomputing.com",
      DB_USER: "your-username",
      PRIVATE_KEY_PATH: "/path/to/your/private-key.pem",
      PRIVATE_KEY_PASSPHRASE: "your-passphrase", // optional, only if private key is encrypted
      DB_DATABASE: "your-database",
      SCHEMA: "your-schema",
      WAREHOUSE: "your-warehouse", // optional
      ROLE: "your-role", // optional
      PORT: 443, // optional
      POOL_MAX: 10, // optional, default 10
      POOL_MIN: 0   // optional, default 0
    }
  }
};
```

### Option B: Private Key from AWS Secrets Manager
```javascript
const config = {
  DATASOURCES: {
    mySnowflakeDB: {
      DB_HOST: "your-account.snowflakecomputing.com",
      DB_USER: "your-username",
      PRIVATE_KEY_SECRET_NAME: "my-snowflake-private-key",
      PRIVATE_KEY_FIELD_NAME: "privateKey", // required - exact field name in the secret
      PRIVATE_KEY_PASSPHRASE: "your-passphrase", // optional, only if private key is encrypted
      DB_DATABASE: "your-database",
      SCHEMA: "your-schema",
      WAREHOUSE: "your-warehouse", // optional
      ROLE: "your-role", // optional
      PORT: 443, // optional
      POOL_MAX: 20, // optional, default 10
      POOL_MIN: 2   // optional, default 0
    }
  }
};
```

## Setting up Key Pair Authentication in Snowflake

1. **Generate RSA Key Pair:**
   ```bash
   # Generate private key (2048-bit minimum)
   openssl genrsa -out rsa_key.pem 2048
   
   # Generate public key
   openssl rsa -in rsa_key.pem -pubout -out rsa_key.pub
   
   # Extract public key content (remove header/footer lines)
   openssl rsa -in rsa_key.pem -pubout -outform DER | base64 | tr -d '\n'
   ```

2. **Configure Snowflake User:**
   ```sql
   -- Set the public key for your user (use the base64 content from step 1)
   ALTER USER your_username SET RSA_PUBLIC_KEY='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...';
   ```

3. **For AWS Secrets Manager setup:**
   ```json
   {
     "privateKey": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----"
   }
   ```

## Basic Usage

```javascript
const snowflakeConnector = require('@softrams/nodejs-snowflake-connector');

async function main() {
  try {
    // Initialize with configuration
    await snowflakeConnector.init(config);

    // Execute simple query
    const results = await snowflakeConnector.execute(
      'mySnowflakeDB', 
      'SELECT CURRENT_VERSION() as version, CURRENT_USER() as user'
    );
    console.log('Connection info:', results);

    // Execute parameterized query
    const userData = await snowflakeConnector.execute(
      'mySnowflakeDB', 
      'SELECT * FROM users WHERE id = ? AND status = ?', 
      [123, 'active']
    );
    console.log('User data:', userData);

  } catch (error) {
    console.error('Database operation failed:', error);
  } finally {
    // Clean up connections
    await snowflakeConnector.closeAllPools();
  }
}

main();
```

## API Reference

### `init(config)`
Initialize the connector with configuration.
- **config**: Configuration object containing DATASOURCES

### `execute(dataSourceName, query, params?)`
Execute a SQL query on the specified data source.
- **dataSourceName**: Name of the configured data source
- **query**: SQL query string with `?` placeholders for parameters
- **params**: Array of parameter values (optional)
- **Returns**: Promise<Array> - Query results

### `createSnowPool(poolName)`
Create a connection pool for the specified data source.
- **poolName**: Name of the data source
- **Returns**: Promise<boolean> - Success status

### `connect(poolName)`
Get a connection from the specified pool.
- **poolName**: Name of the data source
- **Returns**: Promise<Pool> - Connection pool

### `closePool(poolName)`
Close a specific connection pool.
- **poolName**: Name of the data source
- **Returns**: Promise<boolean> - Success status

### `closeAllPools()`
Close all connection pools.
- **Returns**: Promise<boolean> - Success status

## Configuration Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `DB_HOST` | ✅ Yes | Snowflake account URL (e.g., `account.snowflakecomputing.com`) |
| `DB_USER` | ✅ Yes | Snowflake username |
| `DB_DATABASE` | ✅ Yes | Database name |
| `SCHEMA` | ✅ Yes | Schema name |
| `PRIVATE_KEY_PATH` | ⚠️ One Required | Path to private key file (mutually exclusive with SECRET_NAME) |
| `PRIVATE_KEY_SECRET_NAME` | ⚠️ One Required | AWS Secrets Manager secret name (mutually exclusive with PATH) |
| `PRIVATE_KEY_FIELD_NAME` | ⚠️ Required for AWS | Exact field name in the secret containing the private key |
| `PRIVATE_KEY_PASSPHRASE` | ❌ Optional | Passphrase for encrypted private key |
| `WAREHOUSE` | ❌ Optional | Warehouse name |
| `ROLE` | ❌ Optional | Role name |
| `PORT` | ❌ Optional | Port number (default: 443) |
| `POOL_MAX` | ❌ Optional | Maximum pool connections (default: 10) |
| `POOL_MIN` | ❌ Optional | Minimum pool connections (default: 0) |

## AWS Secrets Manager Setup

1. **Create a secret in AWS Secrets Manager:**
   ```bash
   aws secretsmanager create-secret \
     --name "my-snowflake-private-key" \
     --description "Snowflake private key for authentication" \
     --secret-string '{"privateKey":"-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_CONTENT\n-----END PRIVATE KEY-----"}'
   ```

2. **Ensure your application has IAM permissions:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "secretsmanager:GetSecretValue"
         ],
         "Resource": "arn:aws:secretsmanager:region:account:secret:my-snowflake-private-key*"
       }
     ]
   }
   ```

3. **Configure AWS credentials** (one of the following):
   - Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - IAM roles (recommended for EC2/ECS/Lambda)
   - AWS credentials file (`~/.aws/credentials`)

## Error Handling

The connector provides detailed error messages for common configuration issues:

```javascript
// Missing required configuration
// Error: "Missing required configuration fields for myPool: DB_HOST, DB_USER"

// Authentication not configured
// Error: "Authentication configuration missing for myPool. Must provide either PRIVATE_KEY_PATH or PRIVATE_KEY_SECRET_NAME"

// AWS Secrets Manager field not found
// Error: "Private key not found in secret my-secret. Field 'wrongField' does not exist. Available fields: privateKey, otherField"

// Private key file not found
// Error: "ENOENT: no such file or directory, open '/wrong/path/key.pem'"
```

## Dependencies

- **snowflake-sdk**: Snowflake's official Node.js driver
- **aws-sdk**: AWS SDK for Secrets Manager integration

## Requirements

- Node.js >= 14.0.0
- Snowflake account with key pair authentication enabled
- RSA private key (2048-bit minimum recommended)

## License

MIT

## Support

For issues and questions:
- [GitHub Issues](https://github.com/softrams/nodejs-snowflake-connector/issues)
- [Snowflake Documentation](https://docs.snowflake.com/en/user-guide/nodejs-driver-use.html)
