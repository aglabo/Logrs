---
title: Part 1.3 — メタブロック (構文的除外領域)
description: DSL 定義を構文的に解釈対象外とし、自己再帰リスクを防ぐメタブロックの定義
version: 0.5.1
update: 2026-09-20
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- markdownlint-disable line-length -->

[← 01-syntax-core](./01-syntax-core.md) | [索引](./README.md) | [03-semantics-core →](./03-semantics-core.md)

## Part 1: Syntax (続き)

### 1.3 メタブロック (構文的除外領域)

**設計意図**: DSL の定義そのものを **構文的に** 処理対象外とし、自己再帰リスクを根本的に防ぎます。

DSL を記述した文書を llm が読むとき、DSL の定義部分を「処理すべき対象」として扱ってしまうと、定義が自分自身に適用される再帰が起こります。メタブロックはこれを構文層で断ち切ります。

**構文**:

```abnf
<meta-block>    ::= "%" <block-type> "{{" <block-content> "}}"
<block-type>    ::= "dsl" / "define" / "rule" / "input" / "output" / "profile"
<block-content> ::= *(<statement> / <block>)
```

**block-type の意味**:

| タイプ     | 用途                                  | 例                             |
| ---------- | ------------------------------------- | ------------------------------ |
| `%dsl`     | DSL 構文定義 (BNF、意味論)            | Part 1, Part 2 の定義          |
| `%define`  | コマンド・変数・イベントの定義 / 合成 | モード定義、ハンドラ定義       |
| `%rule`    | 制約・規則定義 (rule / constraint)    | 動作規則・ガード条件           |
| `%input`   | 入力セクション (変数初期化)           | セッション変数の初期値設定     |
| `%output`  | 出力定義                              | 出力フォーマット定義           |
| `%profile` | ドメイン適用の宣言                    | プロファイルのメタ情報・方針   |

`<block-type>` に挙げた 6 つは標準の種別です。`%` に続く識別子は自由なので、ドメインが必要とする種別を追加できます。標準の 6 つ以外の種別も、メタブロックとして同じ扱いを受けます。

**note**: v0.3.0 の `%macro` は `%define` に改名しました。「マクロ」という語がレビュー用テンプレート集という含意を持っていたためで、役割は変わりません。`%policy` は `%profile` に統合しました。

使用例:

```text
%define {{
  ; この領域は llm の処理対象外

  :acceptance {{
    pending -> "受付中"
    active  -> "処理中"
    :initial_acceptance <- pending
  }}

  /begin {{
    :buffer <- _
  }}

  /end {{
    ! "buffer の内容を確定する"
  }}
}}

; この Markdown 説明文はメタブロックの外側なので処理対象
```

**acceptance 説明**: `pending` は入力受付状態、`active` は処理実行状態です。

**重要な特性**:

1. 構文的除外: `%<type> {{` … `}}` の内側は llm の処理対象から除外される
2. 定義登録: 内容は「定義」として登録・解釈されるが、処理対象の内容としては評価されない
3. 指摘禁止: 誤字脱字・曖昧表現を含め、内容に対する一切の指摘を禁止
4. スコープ: ブロック外の地の文だけが処理対象

**rule との違い**:

- `rule non-processing areas` → 解釈層での除外 (llm が内容を理解したうえで除外する)
- `%<type> {{` … `}}` → 構文層での除外 (llm は単にスキップする)

メタブロックにより、自己再帰問題が根本的に解決されます。

**note**: メタブロックの範囲は `{{` と `}}` の対応だけで決まります。レイアウトは関係しません ([01-syntax-core の 1.1.3 字句規則](./01-syntax-core.md#113-字句規則))。
