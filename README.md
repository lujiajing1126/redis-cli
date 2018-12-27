[![npm version](https://badge.fury.io/js/redis-cli.svg)](https://badge.fury.io/js/redis-cli)


## Redis-Cli

### Install

```
npm install -g redis-cli
```

### Usage

```
rdcli
// which is default connect to 127.0.0.1:6379
rdcli -h 10.4.23.235
// which will connect to 10.4.23.235
```
## Roadmap

  - support `block` commands
  - more available cli params like official redis-cli
  - handle cluster-like redis (PaaS) which do not support **ALL** CMD
  - support MEMCACHE protocol


## LISENCE

MIT
