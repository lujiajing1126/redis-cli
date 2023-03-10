[![license](https://img.shields.io/github/license/lujiajing1126/redis-cli.svg)](https://github.com/lujiajing1126/redis-cli)
[![npm version](https://badge.fury.io/js/redis-cli.svg)](https://badge.fury.io/js/redis-cli)
[![CircleCI](https://circleci.com/gh/lujiajing1126/redis-cli.svg?style=svg)](https://circleci.com/gh/lujiajing1126/redis-cli)
[![Codecov](https://codecov.io/gh/lujiajing1126/redis-cli/branch/master/graph/badge.svg)](https://codecov.io/gh/lujiajing1126/redis-cli)

[![NPM](https://nodei.co/npm/redis-cli.png)](https://github.com/lujiajing1126/redis-cli)

## Redis-Cli

### Install

```shell
$ npm install -g redis-cli
```

### Usage

```shell
$ rdcli
// which is default connect to 127.0.0.1:6379
$ rdcli -h 10.4.23.235
// which will connect to 10.4.23.235
$ rdcli -c
// works in cluster mode, which will follow cluster redirection
```


```
$ rdcli --help
rdcli [OPTIONS] [cmd [arg [arg ...]]]

Options:
      --help     Show help                                             [boolean]
      --version  Show version number                                   [boolean]
  -h, --host     Server hostname (default: 127.0.0.1).
                                                 [string] [default: "127.0.0.1"]
  -p, --port     Server port (default: 6379).           [number] [default: 6379]
  -s, --socket   Server socket (overrides hostname and port).           [string]
  -a, --auth     Server password.                                       [string]
  -n             Database number                           [number] [default: 0]
  -u             Server URI.                                            [string]
  -m, --mode     Server Type, only redis available now.
                                           [choices: "redis"] [default: "redis"]
  -c, --cluster  Enable cluster mode (follow -ASK and -MOVED redirections).
                                                      [boolean] [default: false]
      --tls      Establish a secure TLS connection.   [boolean] [default: false]
```

## Roadmap
- more available cli params like official redis-cli
- handle cluster-like redis (PaaS) which do not support **ALL** CMD
- support MEMCACHE protocol

## LICENSE

MIT
