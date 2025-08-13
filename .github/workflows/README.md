# GitHub Actions Workflows

This directory contains GitHub Actions workflows for automated testing and CI/CD.

## Workflows

### 1. `ci.yml` - Simple CI Pipeline
**Recommended for most use cases**

- Runs on every push and PR to `main` and `develop` branches
- Uses Node.js 20.x
- Steps:
  1. Install dependencies (root, contracts, js-api)
  2. Compile contracts
  3. Build TypeScript
  4. Run contract tests
  5. Start Hardhat node and deploy contracts
  6. Run JS API tests

This workflow is simpler and more reliable for basic CI needs.

### 2. `test.yml` - Comprehensive Test Suite
**For thorough testing across multiple Node.js versions**

- Runs on multiple Node.js versions (18.x, 20.x)
- More comprehensive testing including:
  - Contract compilation and testing
  - JS API unit and integration tests
  - TypeScript type checking
  - Better error handling and logging
- Separate lint job for code quality checks

## Local Testing

Before pushing, you can test the same steps locally:

```bash
# From project root
npm ci
cd contracts && npm ci
cd ../js-api && npm ci

# Compile contracts
cd ../contracts
npx hardhat compile

# Build TypeScript
cd ../js-api
npm run build

# Run tests (requires Hardhat node)
cd ../contracts
npx hardhat node &  # Start in background
npx hardhat run deploy/00_deploy_contract.js --network localhost

cd ../js-api
npm test
```

## Status Badges

The following badges show the current status of our workflows:

- [![CI](https://github.com/plebbit/plebbit-tipping-v1/actions/workflows/ci.yml/badge.svg)](https://github.com/plebbit/plebbit-tipping-v1/actions/workflows/ci.yml)
- [![Test Suite](https://github.com/plebbit/plebbit-tipping-v1/actions/workflows/test.yml/badge.svg)](https://github.com/plebbit/plebbit-tipping-v1/actions/workflows/test.yml)

## Troubleshooting

### Common Issues

1. **Hardhat node not starting**: The workflow waits up to 30 seconds for the node to be ready
2. **Port conflicts**: CI uses port 8545 (default Hardhat port)
3. **Memory issues**: Large test suites may need more memory allocation

### Debugging Failed Workflows

1. Check the "Show Hardhat logs on failure" step in failed runs
2. Look at the specific step that failed
3. Test the same commands locally to reproduce the issue

### Node.js Version Compatibility

- **Node.js 18.x**: Minimum supported version
- **Node.js 20.x**: Recommended version (used in simple CI)
- Both versions are tested in the comprehensive test suite
