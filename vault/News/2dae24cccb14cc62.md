---
title: AWS Batch, 작업 상태·소요시간 지표를 CloudWatch로 전송
type: news
schema_version: tech-news/v1
date: 2026-10-07
created: 2026-10-07
updated: 2026-10-07
event_id: 2dae24cccb14cc62
review_status: verified
concept_ids: []
published_at: 2026-10-06
reviewed_at: 2026-10-07
source_url: https://aws.amazon.com/about-aws/whats-new/2026/10/aws-batch-job-cloudwatch-metrics/
sources:
  - https://aws.amazon.com/about-aws/whats-new/2026/10/aws-batch-job-cloudwatch-metrics/
concepts: []
description: AWS는 2026년 10월 6일 AWS Batch가 작업 지표를 Amazon CloudWatch에 자동으로 전송하는
  기능을 발표했다. 제출·실행·성공·실패 상태로 진입한 작업 수와 상태 사이의 소요시간을 확인할 수 있으며, AWS Batch를 제공하는 모든
  AWS 리전에서 사용할 수 있다.
theme_format: news-themes/v1
sector: 소프트웨어·클라우드
theme: 제품·서비스
secondary_theme: null
event_tags:
  - 기능 추가
entities:
  - AWS
tags:
  - sector/software-cloud
  - theme/products
  - event/기능-추가
editorial_format: six-w/v1
kind: 사건 뉴스
region: 해외
lead: AWS는 2026년 10월 6일 AWS Batch가 작업 지표를 Amazon CloudWatch에 자동으로 전송하는 기능을 발표했다.
  제출·실행·성공·실패 상태로 진입한 작업 수와 상태 사이의 소요시간을 확인할 수 있으며, AWS Batch를 제공하는 모든 AWS 리전에서
  사용할 수 있다.
facts:
  who: AWS
  when: 2026-10-06
  where: AWS Batch가 제공되는 모든 AWS 리전
  what: AWS Batch 작업 지표의 CloudWatch 자동 전송
  how: AWS/Batch 네임스페이스에 JobQueueName 차원을 포함해 상태 전환 및 지속 시간 메트릭을 발행
  why: 배치 워크로드에 대한 네이티브 관측성 제공
explanations:
  - heading: CloudWatch 메트릭 구성
    paragraphs:
      - 지표는 CloudWatch의 AWS/Batch 네임스페이스에 작업 대기열 이름(JobQueueName)별로 기록된다. 상태 전환
        지표는 각 상태에 진입한 작업 수를, 소요시간 지표는 제출부터 실행 가능 상태까지 걸린 시간이나 전체 실행시간을 추적한다.
    source_urls:
      - https://aws.amazon.com/about-aws/whats-new/2026/10/aws-batch-job-cloudwatch-metrics/
papers: []
relations: []
topic_ids: []
cssclasses:
  - garden-generated
generated_by: tech-knowledge-garden
---

# AWS Batch, 작업 상태·소요시간 지표를 CloudWatch로 전송


AWS는 2026년 10월 6일 AWS Batch가 작업 지표를 Amazon CloudWatch에 자동으로 전송하는 기능을 발표했다. 제출·실행·성공·실패 상태로 진입한 작업 수와 상태 사이의 소요시간을 확인할 수 있으며, AWS Batch를 제공하는 모든 AWS 리전에서 사용할 수 있다. [원문 1](<https://aws.amazon.com/about-aws/whats-new/2026/10/aws-batch-job-cloudwatch-metrics/>)

### CloudWatch 메트릭 구성

지표는 CloudWatch의 AWS/Batch 네임스페이스에 작업 대기열 이름(JobQueueName)별로 기록된다. 상태 전환 지표는 각 상태에 진입한 작업 수를, 소요시간 지표는 제출부터 실행 가능 상태까지 걸린 시간이나 전체 실행시간을 추적한다. [원문 1](<https://aws.amazon.com/about-aws/whats-new/2026/10/aws-batch-job-cloudwatch-metrics/>)



## 이 소식을 다룬 브리핑

- [[Briefings/2026/10/2026-10-07_0800_Tech_AI_Briefing|2026-10-07 브리핑]]
