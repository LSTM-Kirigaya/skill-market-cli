---
name: tencent-ses-service
purpose: 腾讯云官方的邮件推送 SES 服务使用 skill。涵盖 SMTP 发送邮件所需的全部环境变量、API 接口设计规范、验证码邮件的完整发送流程（含人机验证、频率控制、Redis 存储）。
tags:
  - email-ses-smtp
  - 腾讯云邮件
  - security
  - api
  - 自动化
model: claude-sonnet-4-6
rootUrl: http://localhost:9999/SKILL.md
---

# 腾讯云邮件推送 SES 服务

本 skill 描述如何通过腾讯云 SES（Simple Email Service）的 SMTP 协议发送邮件。

## 前置条件

在腾讯云控制台开通 SES 服务，完成发件域名配置和 DKIM/SPF 验证。

## 环境变量

| 变量名 | 说明 |
|---|---|
| `TENCENTCLOUD_SMTP_HOST` | SMTP 服务器地址 |
| `TENCENTCLOUD_SMTP_PORT` | SMTP 端口 |
| `TENCENTCLOUD_SMTP_USER` | SMTP 认证用户名 |
| `TENCENTCLOUD_SMTP_PASSWORD` | SMTP 认证密码 |

## Usage Examples

帮我实现一个发送邮箱验证码的接口，使用腾讯云 SES SMTP 方式。需要配置 SMTP 环境变量，设计验证码发送接口，包含参数校验、频率控制、Redis 存储和 SMTP 发送。

使用 claude-sonnet-4-6 模型生成包含完整错误处理和日志的 Go 代码。
