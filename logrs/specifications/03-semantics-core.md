---
title: Part 2 (前半) — 意味論の基礎
description: 構文と意味論の分離、値集合の意味論的検証、メタブロック意味論、コマンドエイリアス解決、note 意味論、コマンド実行制約、変数スコープ
version: 0.7.0
update: 2026-09-20
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- textlint-disable ja-technical-writing/max-comma -->
<!-- markdownlint-disable line-length -->

[← 02-syntax-metablock](./02-syntax-metablock.md) | [索引](./README.md) | [04-semantics-execution →](./04-semantics-execution.md)

## Part 2: Semantics

### 構文と意味論の分離

```text
%rule {{

  rule syntax-semantics separation: <<<
Syntax (01-syntax-core) と Semantics (本ファイル以降) は独立した評価レイヤーである

構文レイヤー (01-syntax-core の BNF):
  - DSL 構文の文法的正当性を定義
  - パース可能性を判定
  - 文法要素として書けることを規定

意味論レイヤー (Semantics):
  - 定義の実行時意味を定義
  - 制約・条件・状態遷移を評価
  - 実行時契約を表現
<<<

  rule evaluation phases: <<<
DSL 定義の解釈は以下の 3 段階で行われる:
  1. 構文解析 (Syntax): 文法的正当性検証
  2. 意味論評価 (Semantics): 制約・遷移規則・スコープ検証
  3. 実行 (プロファイル): ドメイン定義に従った動作
<<<

  rule macro evaluation order: <<<
意味論評価フェーズにおいて、定義要素は以下の順序で解釈される:
  1. 定義ブロック: コマンド・変数・モード定義の登録
  2. constraint: 実行条件・制約の評価
  3. rule: 動作規則・ガード条件の評価
  4. イベント・合成: ハンドラ・合成規則の評価
<<<

  constraint semantic consistency: <<<
- 文法的に正しくても意味論的に矛盾する定義は未定義動作
- constraint / rule は意味論的ガードであり構文要素ではない
- llm は constraint / rule を解釈フェーズで評価される契約として扱う
- BNF で書けることと実行時有効性は独立
<<<

  constraint evaluation dependencies: <<<
- constraint / rule は定義ブロックで定義された要素を参照可能
- イベント・合成は全ての制約・規則を認識した状態で合成
- 評価フェーズの暗黙的動作による不整合を禁止
<<<

}}
```

### 値集合の意味論的検証

v0.1.1 では `status` と `priority` の値集合を BNF のリテラルで検証していました。v0.2.0 では予約語を廃したため、これらは意味論層の制約として定義します。

```text
%rule {{

  constraint status values: <<<
status の値は以下の集合に限定される:
  - draft      : 生成開始・情報収集中
  - incomplete : 情報不足を検出
  - ready      : 生成完了
集合外の値を与えた定義は未定義動作とする
<<<

  priority: A >> B >> C >> D >> E

  constraint priority values: <<<
priority の値は上の位階軸に属する識別子に限定される
A が最上位、E が最下位である
priority の値のみ大文字を維持する (出力フォーマットという外部契約のため)
集合外の値を与えた定義は未定義動作とする
<<<

  constraint acceptance values: <<<
acceptance の値は以下の集合に限定される:
  - pending : 受付中
  - active  : 処理中
<<<

}}
```

### 位階の意味論

`>>` は位階軸の宣言 (`<rank-def>`) と位階比較 (`<rank-comparison>`) の 2 か所に現れます ([01-syntax-core の 1.1.5 位階](./01-syntax-core.md#115-位階))。文法はどちらも受理しますが、比較が意味を持つ条件は意味論層が定めます。

```text
%rule {{

  rule rank axis resolution: <<<
位階比較 `X >> Y` は以下の順で解決する:
  1. X と Y が属する位階軸を、宣言済みの位階軸から探す
  2. 両者が同一の位階軸に属するとき、宣言順の位置で比べる。左にあるほうが上位
  3. それ以外は未定義動作とする
<<<

  constraint rank undefined cases: <<<
以下は未定義動作である:
  - 位階軸をまたぐ比較 (別々の軸に属する値どうし)
  - どの位階軸にも属さない値を項に置いた比較
  - 変数の実行時の値が、どの位階軸にも属さない場合
<<<

  constraint rank single type: <<<
位階は値の型を増やさない
位階軸に属する値も、変数に格納されるときは文字列である
`>>` が参照するのは値そのものではなく位階軸の宣言である
<<<

  constraint rank condition scope: <<<
位階軸を条件式の項に置けるかどうかは、軸ごとに定める
既定では置ける
置けない軸は、その軸を宣言した側が明示しなければならない
<<<

  constraint rank total order: <<<
位階は全順序である
同位は表現しない
同じ重みを持つ値が必要な場合は、位階軸を入れ子のブロックに分けて表す
<<<

}}
```

**note**: `priority` は条件式の項に置けない位階軸です ([04-semantics-execution の構文要素の意味](./04-semantics-execution.md#構文要素の意味))。位階として宣言するのは、衝突時にどちらが上位かを構造として残すためであって、実行条件の判定に使うためではありません。

### メタブロック意味論

```text
%rule {{

  rule meta-block semantics: <<<
`%<type> {{` … `}}` 内は以下の特性を持つ:
  - 構文的除外: llm の処理対象から完全に除外
  - 定義登録: 内容を「定義」として登録するかは種別ごとに定まる (%example は登録しない)
  - 文章評価なし: 誤字脱字・曖昧表現を含め内容に対する一切の指摘を禁止
  - スコープ境界: ブロック外の地の文のみが処理対象
<<<
  rule block-type usage: <<<
block-type は以下の用途で使用される:
  - %dsl    : DSL 構文定義 (BNF、意味論)
  - %define  : コマンド・変数・イベントの定義 (合成を含む)
  - %rule   : 制約・規則定義 (rule / constraint / category / priority)
  - %input  : 入力セクション (変数初期化)
  - %profile : ドメイン適用の宣言 (方針・制約)
  - %output : 出力定義
  - %example : 例示 (登録されない)
<<<

  rule meta-block processing: <<<
llm はメタブロックを以下の 3 段階で処理する:
  1. 構文解析フェーズ:
     - `%<type> {{` 検出でメタブロック開始
     - 対応する `}}` まで内容を「定義データ」として取り込み
     - 処理対象リストから除外
  2. 意味論評価フェーズ:
     - メタブロック内の定義を登録 (acceptance / コマンド / 変数 等)
     - 制約・規則を評価
     - 文章としての評価は行わない
  3. 処理フェーズ:
     - メタブロック外の Markdown 説明文のみを処理
     - メタブロック内には一切アクセスしない
<<<
  constraint meta-block processing: <<<
- llm はメタブロック内を「定義データ」として扱う
- %example の内側は登録せず、入れ子のブロックにも再帰的に伝播する
- 内容の正確性・可読性を評価しない
- ブロック境界は厳密に遵守される
<<<

  rule self-recursion prevention: <<<
メタブロックは二重防護により自己再帰リスクを排除する:
  - 第一防壁: メタブロック構文による物理的遮断 (構文層での除外)
  - 第二防壁: rule non-proofreading areas による論理的制約 (意味論層での除外)
<<<

  constraint exclusion layer distinction: <<<
- メタブロック: 構文層での除外 (llm は領域をスキップ)
- rule non-proofreading areas: 解釈層での除外 (llm は理解して従う)
<<<

}}
```

### コマンドエイリアス解決

```text
%rule {{

  rule command-alias-resolution: <<<
コマンドエイリアスは意味論レイヤーでの正規化機構である

定義層:
  - 意味論レイヤー (構文ではない)
  - BNF 定義の変更不要 (<identifier> で既にカバー済み)

評価時期:
  - コマンド評価前の正規化フェーズ
  - 構文解析後、意味論評価前

効果範囲:
  - すべてのコマンド動作 (完全一致)
  - acceptance 遷移、execute_mode 遷移、副作用すべてを含む

宣言方法:
  - プロンプト固有定義セクションで列挙
<<<

  rule alias-normalization {{
    note: <<<
コマンドエイリアス正規化規則:
<<<

    ("command が alias-map のキーに含まれる") {{
      ! "alias-map で command を解決した値に置き換える"
    }}

    note: <<<
正規化後の動作:
- エイリアス解決後は元のコマンドと完全一致
- 意味論的差異・副作用の違いは存在しない
- acceptance 遷移、execute_mode 遷移、再入禁止挙動すべて一致
<<<

  }}
  constraint alias-semantics: <<<
- エイリアスは構文拡張ではなく、意味論層での正規化
- エイリアスは評価前に正規化され、完全なコマンド等価性を保証
- エイリアス独自の動作・副作用は存在しない
- プロンプト間でのエイリアス定義の統一は不要 (プロンプト固有の利便性機能)
<<<

  %example alias-usage {{
    note: <<<
`/w` を `/emit` のエイリアスとして定義する例:
<<<

    /w {{
      ; 正規化により /emit に変換される
      ; 以降の動作は /emit と完全一致
    }}

    note: <<<
使用時の動作:
- `/w` 入力 → 正規化 → `/emit`
- `/emit` のすべての制約・動作を継承
- acceptance: pending => active (一時) => pending
- execute_mode: idle => processing => idle
- 再入禁止
- generation-status 遷移
<<<

  }}
}}
```

### note 意味論

```text
%rule {{

  rule note semantics: <<<
note は以下の特性を持つ:
  - 構文要素として認識される
  - 実行・制約・評価には一切影響しない
  - acceptance 遷移・コマンド可否・条件分岐の判断材料に使用してはならない
  - llm は note を「人間向け説明」として保持するが、解釈ロジックには含めない
<<<

  rule note placement: <<<
note は以下の位置に配置可能:
  - ブロック本体の末尾 (文の後、constraint の前)
  - 複数の note を連続配置可能
  - 文の途中への割り込みは禁止 (制御フロー汚染を防ぐ)
<<<

  constraint note inertness: <<<
- note の内容を根拠として挙動を変更してはならない
- note を参照した結果は未定義動作とする
- note は実行時に読み飛ばされる (評価対象外)
<<<

  constraint note vs rule distinction: <<<
- note : 人間向け補足説明 (不活性)
- rule : llm が解釈・遵守すべき規則 (活性)
- note の内容を rule として扱ってはならない
<<<

}}
```

### ドメイン状態の意味論 (プロファイルへ移動)

v0.3.0 までこの位置にあった `acceptance 遷移` と `記事生成ステータス` は、校閲レビュードメインに固有の定義でした。v0.4.0 でコア仕様から削除しています。コア仕様が固まったのち、プロファイルとしてあらためて定義する予定です。

### コマンド実行制約

```text
%rule {{

  ; :session_phase 依存の実行制約
  rule begin: "/begin は :session_phase == command または :session_phase == waiting で実行しなければならない"

  rule process: <<<
/process は :session_phase == waiting でのみ実行しなければならない
/process は :execute_mode == processing の間は再入してはならない
<<<

  rule emit: <<<
/emit は :session_phase == waiting でのみ実行しなければならない
/emit は :execute_mode == processing の間は再入してはならない
<<<

  rule exit: <<<
/exit は任意の :session_phase で実行できる
/exit は :session_phase と :execute_mode の両方をリセットする
<<<

  rule session_phase vs execute_mode separation {{
    scope: <<<
:session_phase : ユーザーから見える状態を制御する
:execute_mode  : 内部の実行状態を制御する
<<<

    constraint independence: <<<
:session_phase と :execute_mode は独立した変数である
両者は異なる値で同時に存在しうる
<<<

    constraint execute_mode_transition_guard: <<<
:execute_mode は :session_phase == waiting のときだけ遷移する
:session_phase が waiting でないとき :execute_mode は idle を保つ
<<<

    behavior command_execution {{
      precondition: ":session_phase == waiting かつ :execute_mode == idle"

      ("/process または /emit を受けた") {{
        :execute_mode <- processing
      }}

      invariant during_execution: ":session_phase は waiting のまま変化しない"

      ("処理が完了した") {{
        :execute_mode <- idle
        note: <<<
:session_phase は waiting のまま
<<<
      }}

    }}
    note: <<<
/process 実行時、:session_phase は waiting のまま変化せず、
:execute_mode だけが idle => processing => idle と遷移する
<<<

  }}
}}
```

### 変数スコープ

```text
%define {{

  ; @session スコープ: /exit でクリア
  @session :role {{ clearby: "/exit" }}
  @session :link {{ clearby: "/exit" }}

  ; @scoped スコープ: /begin でクリア
  @scoped :buffer {{ clearby: "/begin" }}
  @scoped :review {{ clearby: "/begin" }}

}}
```
