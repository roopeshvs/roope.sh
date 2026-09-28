+++
title = "How RDS Optimized Writes doubles MySQL write throughput"
description = "AWS Nitro lets MySQL trade an old software safety net for a hardware one."
date = 2026-06-28

[taxonomies]
tags = ["aws", "databases"]
+++

AWS markets [RDS Optimized Writes](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-optimized-writes.html) as a free toggle that delivers *"up to two times higher write transaction throughput"* on RDS for MySQL and MariaDB. Same instance class, same engine, same workload. Flip a parameter and write throughput can roughly double, at no additional charge.

That is a tall claim for what looks like a configuration knob. Where does the 2x come from? The short answer: AWS is letting MySQL skip a long-standing safety mechanism called the *InnoDB doublewrite buffer*, and the underlying hardware now provides the guarantee the doublewrite buffer was protecting against.

The rest of this post is the long answer. It walks through what torn pages are, why MySQL has a doublewrite buffer in the first place, why removing it can be worth up to 2x on write-bound workloads, and what specifically changed at the hardware layer that makes this safe.

## The problem: torn pages

<figure>
<svg width="100%" viewBox="0 10 620 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="diag1-title diag1-desc" style="max-width: 620px; display: block; margin: 0 auto;">
  <title id="diag1-title">Torn page after power loss</title>
  <desc id="diag1-desc">A 16 KiB InnoDB page broken across four 4 KiB sectors. Before the write all four sectors hold the old contents. Power is lost partway through writing, leaving two new sectors and two old sectors. That is a torn page.</desc>
  <style>
    .lbl { font: 600 13px ui-sans-serif, system-ui, sans-serif; fill: currentColor; }
    .sm { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: currentColor; opacity: 0.7; }
    .stk { fill: none; stroke: currentColor; stroke-width: 1.5; }
    .stk-fill { fill: currentColor; fill-opacity: 0.08; stroke: currentColor; stroke-width: 1.5; }
  </style>
  <text x="90" y="28" class="lbl" text-anchor="middle">Before write</text>
  <rect x="30" y="48" width="120" height="38" rx="3" class="stk" />
  <rect x="30" y="86" width="120" height="38" rx="3" class="stk" />
  <rect x="30" y="124" width="120" height="38" rx="3" class="stk" />
  <rect x="30" y="162" width="120" height="38" rx="3" class="stk" />
  <text x="90" y="72" class="sm" text-anchor="middle">old · 4 KiB</text>
  <text x="90" y="110" class="sm" text-anchor="middle">old · 4 KiB</text>
  <text x="90" y="148" class="sm" text-anchor="middle">old · 4 KiB</text>
  <text x="90" y="186" class="sm" text-anchor="middle">old · 4 KiB</text>
  <text x="90" y="225" class="sm" text-anchor="middle">16 KiB page</text>
  <line x1="180" y1="125" x2="240" y2="125" stroke="currentColor" stroke-width="1.5" />
  <polygon points="240,119 250,125 240,131" fill="currentColor" />
  <text x="215" y="115" class="sm" text-anchor="middle">write…</text>
  <text x="215" y="190" font-size="22" text-anchor="middle" fill="#ea580c">⚡</text>
  <text x="215" y="225" class="sm" text-anchor="middle" fill="#ea580c">power loss</text>
  <text x="430" y="28" class="lbl" text-anchor="middle">After power loss</text>
  <rect x="370" y="48" width="120" height="38" rx="3" class="stk-fill" />
  <rect x="370" y="86" width="120" height="38" rx="3" class="stk-fill" />
  <rect x="370" y="124" width="120" height="38" rx="3" class="stk" />
  <rect x="370" y="162" width="120" height="38" rx="3" class="stk" />
  <text x="430" y="72" class="sm" text-anchor="middle">new · 4 KiB</text>
  <text x="430" y="110" class="sm" text-anchor="middle">new · 4 KiB</text>
  <text x="430" y="148" class="sm" text-anchor="middle">old · 4 KiB</text>
  <text x="430" y="186" class="sm" text-anchor="middle">old · 4 KiB</text>
  <text x="430" y="225" class="lbl" text-anchor="middle" fill="#ea580c">torn page</text>
</svg>
<figcaption>A 16 KiB InnoDB page is written as four 4 KiB sector writes. Lose power partway through and you get a page that's half-new, half-old. That is a torn page.</figcaption>
</figure>

InnoDB stores all of its data in 16 KiB pages by default. Disks and filesystems, however, work in smaller units, typically 4 KiB sectors. When MySQL writes a 16 KiB page to disk, the operating system breaks it into four 4 KiB sector writes underneath. If something goes wrong partway through (a power outage, a kernel panic, a disk failure), the page on disk ends up with a mix of new and old bytes. This is called a *torn page* or *partial page write*.

A torn page is unrecoverable from MySQL's redo log alone. The redo log records *changes* to pages (for example, "in page X, at offset Y, set the value to Z"), not the full page contents. Replaying those changes assumes the page itself is intact to begin with. If the page is half-new and half-old, the redo log has nothing clean to apply against, and recovery fails.

Databases solve this two ways. PostgreSQL writes full page copies into its write-ahead log on first modify after a checkpoint (the `full_page_writes` setting). MySQL takes a different route: it keeps a redundant copy of every dirty page in a dedicated on-disk area called the doublewrite buffer. The trade-offs differ; the goal of surviving torn pages is the same. [Percona has a great side-by-side](https://www.percona.com/blog/a-tale-of-two-databases-how-postgresql-and-mysql-handle-torn-pages/).

## MySQL's solution: the doublewrite buffer {#mysqls-solution-the-doublewrite-buffer}

<figure>
<svg width="100%" viewBox="0 50 720 155" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="diag2-title diag2-desc" style="max-width: 720px; display: block; margin: 0 auto;">
  <title id="diag2-title">MySQL write path with the doublewrite buffer</title>
  <desc id="diag2-desc">A dirty page in the buffer pool is written to the doublewrite area on disk and fsynced, then written to its final tablespace location and fsynced again. Every dirty page becomes two physical writes.</desc>
  <style>
    .lbl { font: 600 13px ui-sans-serif, system-ui, sans-serif; fill: currentColor; }
    .sm { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: currentColor; opacity: 0.75; }
    .cap { font: italic 13px ui-sans-serif, system-ui, sans-serif; fill: currentColor; opacity: 0.85; }
    .stk { fill: none; stroke: currentColor; stroke-width: 1.5; }
  </style>
  <rect x="20" y="60" width="170" height="80" rx="6" class="stk" />
  <text x="105" y="95" class="lbl" text-anchor="middle">Dirty page</text>
  <text x="105" y="115" class="sm" text-anchor="middle">(buffer pool)</text>
  <line x1="200" y1="100" x2="270" y2="100" stroke="currentColor" stroke-width="1.5" />
  <polygon points="270,94 280,100 270,106" fill="currentColor" />
  <text x="240" y="90" class="sm" text-anchor="middle">write</text>
  <text x="240" y="120" class="sm" text-anchor="middle">+ fsync</text>
  <rect x="290" y="60" width="170" height="80" rx="6" class="stk" />
  <text x="375" y="95" class="lbl" text-anchor="middle">Doublewrite</text>
  <text x="375" y="115" class="sm" text-anchor="middle">area</text>
  <line x1="470" y1="100" x2="540" y2="100" stroke="currentColor" stroke-width="1.5" />
  <polygon points="540,94 550,100 540,106" fill="currentColor" />
  <text x="510" y="90" class="sm" text-anchor="middle">write</text>
  <text x="510" y="120" class="sm" text-anchor="middle">+ fsync</text>
  <rect x="560" y="60" width="140" height="80" rx="6" class="stk" />
  <text x="630" y="95" class="lbl" text-anchor="middle">Tablespace</text>
  <text x="630" y="115" class="sm" text-anchor="middle">(final location)</text>
  <text x="360" y="190" class="cap" text-anchor="middle">Every dirty page is written twice.</text>
</svg>
<figcaption>The doublewrite buffer write path: each dirty page is written to a reserved on-disk area first, fsynced, then written to its tablespace location, fsynced again.</figcaption>
</figure>

The [official MySQL definition](https://dev.mysql.com/doc/refman/8.0/en/innodb-doublewrite-buffer.html) sums it up:

> The doublewrite buffer is a storage area where InnoDB writes pages flushed from the buffer pool before writing the pages to their proper positions in the InnoDB data files. If there is an operating system, storage subsystem, or unexpected mysqld process exit in the middle of a page write, InnoDB can find a good copy of the page from the doublewrite buffer during crash recovery.

Every dirty page that InnoDB flushes goes through four steps: write the page into the doublewrite area on disk, `fsync()` the doublewrite area, write the page to its actual tablespace location, `fsync()` the tablespace.

On crash, InnoDB compares both copies during recovery. If the tablespace copy is torn but the doublewrite copy is intact, InnoDB rewrites the page from the doublewrite copy. If the tablespace copy is intact, the doublewrite copy is discarded. [Percona's explainer on the recovery mechanic](https://www.percona.com/blog/innodb-double-write/) goes deeper.

Despite the name, the latency overhead on a well-tuned MySQL is not 2x. The MySQL manual is explicit:

> Although data is written twice, the doublewrite buffer does not require twice as much I/O overhead or twice as many I/O operations. Data is written to the doublewrite buffer in a large sequential chunk, with a single fsync() call to the operating system.

On a healthy system, the steady-state cost is roughly 5–10%. MySQL 8.0.20 also made the doublewrite path scale better by moving the buffer out of the system tablespace (`ibdata1`) and into [dedicated files](https://dev.mysql.com/doc/refman/8.0/en/innodb-doublewrite-buffer.html) like `#ib_16384_0.dblwr`, with one set per buffer pool instance. That removed a long-standing concurrency bottleneck.

The doublewrite buffer is controlled by a single variable, on by default:

```sql
SHOW VARIABLES LIKE 'innodb_doublewrite';
-- +--------------------+-------+
-- | Variable_name      | Value |
-- +--------------------+-------+
-- | innodb_doublewrite | ON    |   ← stock MySQL
-- +--------------------+-------+
```

Since MySQL 8.0.30, the parameter accepts a richer set of values: `ON` (the default, equivalent to `DETECT_AND_RECOVER`), `DETECT_ONLY` (writes metadata, doesn't recover full pages), and `OFF`.

## Why "2x", then? The write amplification angle

There is a contradiction lurking here: the MySQL manual says the doublewrite buffer adds modest I/O overhead, yet AWS markets removing it as a 2x win. Both are true; they are talking about different things.

The "modest overhead" framing measures *latency on a system with I/O headroom*. The buffer's writes are sequential and batched, so they amortise into a small per-transaction cost.

The "up to 2x" framing measures *throughput on a system that's running out of I/O headroom*. The doublewrite buffer doubles the *volume* of page data hitting durable storage; every dirty page lands on disk twice. On write-bound workloads, the binding constraint isn't latency, it's bytes-per-second to storage. Halve the bytes and you can serve roughly twice the writes before saturating the volume.

That is exactly the regime AWS's benchmark targets. The [AWS Database Blog deep dive](https://aws.amazon.com/blogs/database/improve-application-performance-on-amazon-rds-for-mysql-and-mariadb-instances-and-mysql-multi-az-db-clusters-with-optimized-writes/) describes a sysbench write-only workload on a `db.r6g.8xlarge` with 50,000 provisioned IOPS in a Multi-AZ setup, deliberately write-bound. Mixed or read-heavy workloads see far less benefit because they were never bottlenecked on the second write to begin with.

Percona has separately measured how badly a misconfigured doublewrite path can hurt. They show [up to 55% write IOPS reduction](https://www.percona.com/blog/improve-innodb-performance-write-bound-loads/) on write-bound loads when the legacy single-buffer design becomes a contention point. The fix in stock MySQL is tuning `innodb_doublewrite_pages` upward. AWS's fix is to remove the buffer entirely.

## When the doublewrite buffer is redundant

If the doublewrite buffer exists to protect against torn pages, then any storage layer that already guarantees atomic 16 KiB writes makes the buffer redundant. This is not a new idea, and MySQL has long known how to skip the buffer when it is safe to:

- **Fusion-io with NVMFS.** The MySQL manual says it directly: *"If the doublewrite buffer is located on a Fusion-io device that supports atomic writes, the doublewrite buffer is automatically disabled and data file writes are performed using Fusion-io atomic writes instead."*
- **ZFS with `recordsize=16K`.** ZFS's copy-on-write semantics mean a 16 KiB write either completes to a new block or never publishes. There is no in-place overwrite to be interrupted. [OpenZFS tuning docs](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Workload%20Tuning.html) recommend `recordsize=16K` precisely for InnoDB.
- **MariaDB's `innodb_use_atomic_writes`.** Since 10.2, MariaDB auto-detects compatible hardware at startup and disables the doublewrite buffer when atomic writes are available ([MariaDB KB](https://mariadb.com/kb/en/atomic-write-support/)).

The pattern is consistent: when the storage stack can atomically commit at least an InnoDB page's worth of data, the application-level safety net becomes redundant. The atomicity moves from software to hardware, and the doublewrite traffic disappears.

## Enter AWS Nitro

<figure>
<svg width="100%" viewBox="0 35 720 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="diag3-title diag3-desc" style="max-width: 720px; display: block; margin: 0 auto;">
  <title id="diag3-title">RDS Optimized Writes path</title>
  <desc id="diag3-desc">A dirty page in the buffer pool is written directly to its final tablespace location in a single atomic 16 KiB write, made possible by the AWS Nitro System.</desc>
  <style>
    .lbl { font: 600 13px ui-sans-serif, system-ui, sans-serif; fill: currentColor; }
    .sm { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; fill: currentColor; opacity: 0.75; }
    .cap { font: italic 13px ui-sans-serif, system-ui, sans-serif; fill: currentColor; opacity: 0.85; }
    .stk { fill: none; stroke: currentColor; stroke-width: 1.5; }
  </style>
  <rect x="20" y="60" width="170" height="80" rx="6" class="stk" />
  <text x="105" y="95" class="lbl" text-anchor="middle">Dirty page</text>
  <text x="105" y="115" class="sm" text-anchor="middle">(buffer pool)</text>
  <line x1="200" y1="100" x2="540" y2="100" stroke="currentColor" stroke-width="1.5" />
  <polygon points="540,94 550,100 540,106" fill="currentColor" />
  <text x="370" y="55" class="sm" text-anchor="middle" fill="#ea580c">AWS Nitro guarantees atomicity</text>
  <text x="370" y="90" class="lbl" text-anchor="middle">atomic 16 KiB write</text>
  <text x="370" y="120" class="sm" text-anchor="middle">+ fsync</text>
  <rect x="560" y="60" width="140" height="80" rx="6" class="stk" />
  <text x="630" y="95" class="lbl" text-anchor="middle">Tablespace</text>
  <text x="630" y="115" class="sm" text-anchor="middle">(final location)</text>
  <text x="360" y="190" class="cap" text-anchor="middle">Every dirty page is written once.</text>
</svg>
<figcaption>With Optimized Writes on, the doublewrite step disappears entirely. The page travels straight from the buffer pool to its final location in one atomic 16 KiB write.</figcaption>
</figure>

[AWS Nitro](https://aws.amazon.com/ec2/nitro/) is the hardware platform underneath modern EC2 (and therefore RDS) instances. It combines dedicated hardware, lightweight firmware, and a stripped-down hypervisor that handles networking, storage, and security functions outside the main host CPU.

For Optimized Writes, the relevant property is that the Nitro storage path guarantees atomic 16 KiB writes. From the [AWS RDS documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-optimized-writes.html):

> These databases run on DB instance classes that use the AWS Nitro System. Because of the hardware configuration in these systems, the database can write 16-KiB pages directly to data files reliably and durably in one step. The AWS Nitro System makes RDS Optimized Writes possible.

When Optimized Writes is on, RDS sets the underlying MySQL variable `innodb_doublewrite` to `FALSE` (`0`). That is the same knob you would flip locally, just with hardware that backs the safety guarantee. ACID is preserved; atomicity simply moves from the doublewrite buffer to the Nitro layer.

The result: every dirty page goes to durable storage once instead of twice. On the same write-bound workload that saturates the doublewrite path, that frees up roughly half the write bandwidth, which is where AWS's up-to-2x throughput claim comes from.

You can verify Optimized Writes is active on your instance the same way you would verify the doublewrite buffer locally:

```sql
SHOW VARIABLES LIKE 'innodb_doublewrite';
-- +--------------------+-------+
-- | Variable_name      | Value |
-- +--------------------+-------+
-- | innodb_doublewrite | OFF   |   ← Optimized Writes active
-- +--------------------+-------+
```

## Turning it on in practice

Optimized Writes is controlled by a single RDS parameter:

```
rds.optimized_writes = AUTO   # Turn on when version × instance class supports it (default)
rds.optimized_writes = OFF    # Force off; falls back to the doublewrite buffer
```

For new instances, the feature is on by default on any combination that supports it:

- **MySQL**: version 8.0.30 and later (8.0.x and 8.4). Supported instance classes cover the modern M and R families: `db.m5/m6i/m6g/m6gd/m7g/m7i/m8g/m8gd`, `db.r5/r5b/r5d/r6g/r6gd/r6i/r7g/r7i/r8g/r8gd`, plus `db.x2idn`/`db.x2iedn`. The [docs page](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-optimized-writes.html) has the canonical list; AWS adds new instance families over time.
- **MariaDB**: 10.6.10+, 10.11.4+, 11.4.3+, or 11.8+. Same shape of instance class coverage, currently without the 8th-generation Graviton families ([MariaDB-specific docs](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-optimized-writes-mariadb.html)).
- **No additional charge.**

Existing instances created before the feature launched (November 27, 2022 for MySQL, March 7, 2023 for MariaDB) have an incompatible underlying file system layout and cannot be flipped in place. The migration path is an [RDS Blue/Green Deployment](https://aws.amazon.com/about-aws/whats-new/2023/10/enable-amazon-rds-optimized-writes-blue-green-deployments/) with the *"Enable Optimized Writes on green database"* and *"Upgrade storage file system configuration"* options ticked. Cut over once the green environment is in sync.

## The catches

A few things worth keeping in mind:

- **"Up to 2x" is a ceiling, not a floor.** AWS says it directly: *"the amount of benefit that can be achieved depends on the type of workload."* Read-heavy or mixed workloads will see a fraction of the gain.
- **RDS only, not Aurora.** Aurora has its own purpose-built storage layer that doesn't use the InnoDB doublewrite buffer at all, so there's nothing to optimise here.
- **No PostgreSQL equivalent.** Postgres handles torn pages via full-page writes in WAL, which is a different architecture entirely. RDS for PostgreSQL has a separate feature called [Optimized Reads](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PostgreSQL.optimizedreads.html), which is unrelated.
- **Existing instances need migration.** The on-disk file system layout differs from the pre-feature state, so a Blue/Green deployment is the only path forward.
- **Snapshot restore is constrained.** Optimized Writes can only restore *into* an instance if the source snapshot was created from one that already supported it.

The doublewrite buffer was a clever software workaround for a storage stack that could not promise atomic 16 KiB writes. AWS Nitro can promise that, end-to-end. So MySQL no longer needs the workaround, and write throughput approximately doubles on write-bound workloads, for free. The buffer still earns its keep on stock MySQL; on RDS, the hardware now does the job. 🍻
