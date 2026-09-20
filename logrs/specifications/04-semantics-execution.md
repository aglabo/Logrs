---
title: Part 2 (後半) — 実行意味論
description: 実行規約、実行順序、合成、イベントシステム、構文要素の意味、停止条件、フォールバック規則
version: 0.8.0
update: 2026-09-20
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- textlint-disable ja-technical-writing/max-comma -->
<!-- markdownlint-disable line-length -->

[← 03-semantics-core](./03-semantics-core.md) | [索引](./README.md) | [05-heuristics →](./05-heuristics.md)

## Part 2: Semantics (続き)

### 実行規約

```text
%rule {{

  rule definition_evaluation_order {{
    semantics: <<<
定義ブロックは上から下へ順番に評価される
プロンプトファイル内の定義順が実行順を決める
<<<

    evaluation_model: <<<
definitions = [def_1, def_2, ..., def_n]
definitions を先頭から順に評価する
<<<

    constraint sequential_evaluation: <<<
1 つの unit の中では、i < j のとき def_i は def_j より先に評価される
同一 unit 内での前方参照は許可されない
unit をまたぐ参照はこの制約の対象外であり、
すべての unit を読み込んだのちに解決する
<<<

  }}
  rule redefinition_prohibition {{
    constraint redefinition_prohibition: "同一スコープ内での再定義は禁止される"

    exception composition: <<<
合成 (`+/cmd`) による拡張は合成であって再定義ではない
合成は再定義禁止に違反しない
<<<

    semantics {{
      ("同一スコープに同名のコマンド定義が存在する") {{
        ! <<<
新しい定義を拒否する
<<<
      }}
      () {{
        ! <<<
新しい定義を受理する
<<<
      }}

    }}
  }}
  rule var_mutability {{
    semantics: <<<
すべての変数宣言は暗黙に可変である
不変変数の概念は存在しない
<<<

    mutability: <<<
/set コマンドは任意の変数をいつでも上書きできる
再代入は常に許可される
<<<

    type_system: <<<
変数に型制約はない
すべての値は文字列として扱われる
<<<

  }}
  rule var_initialization {{
    initialization_rule {{
      ("変数に明示的な初期値がない") {{
        :var <- ""    ; 空文字列
      }}

    }}
    type_semantics: <<<
数値型は存在しない
真偽型は存在しない
すべての値は文字列である (単一型システム)
大小比較 (`<` `<=` `>` `>=`) は比較のあいだだけ両辺を数値として解釈する
解釈の結果は保持されず、値は文字列のままである (01-syntax-core の 1.1.4 を参照)
<<<

  }}
  rule conflict_resolution {{
    constraint_composition: <<<
複数の constraint 句は論理積で結合される
constraints = [c_1, c_2, ..., c_n]
combined_constraint = c_1 and c_2 and ... and c_n
<<<

    priority_usage: <<<
priority は出力コンテキストの衝突解決にのみ使用する
priority を実行制御に使用してはならない
priority を条件分岐に使用してはならない
<<<

    scope: <<<
applicable: 複数の選択肢があるときの出力フィールド選択
not_applicable: 実行文 (`!`) の制御フロー
<<<

  }}
  rule implicit_knowledge_dependency {{
    hybrid_nature: "本 DSL は形式言語であるが、特定の領域では llm の暗黙知に依存する"

    implicit_knowledge_domains {{
      note: <<<
実行文 (`!`):
実行内容は自然言語記述に依存する
llm が自然言語の指示を解釈する
<<<

      note: <<<
field / rule の解釈:
意味解釈は llm の判断に委ねられる
llm が文脈に基づいて適切な解釈を決定する
<<<

      note: <<<
停止条件:
<<<
        ("明示的に定義されていない") {{
          ! <<<
llm が文脈から停止条件を推論する
<<<
        }}

    }}
    formality_boundary: <<<
syntax    : 形式的 (機械的に解析可能)
semantics : ハイブリッド (形式 + 暗黙知)
<<<

  }}
}}
```

### 実行順序

```text
%define {{

  ; 基本順序: クリア → 代入 → 実行 → フェーズ遷移
  /example {{
    :temp_var      <- _
    :result        <- "value"
    ! "処理内容"
    :session_phase <- waiting
  }}

  ; クリアの形式
  /clear_single <:var> {{ :var <- _ }}

  /clear_multi <:v1> <:v2> {{
    :v1 <- _
    :v2 <- _
  }}

  /clear_session {{ @session <- _ }}
  /clear_scope   {{ @scoped  <- _ }}
  /clear_all     {{ @*       <- _ }}

  rule clear all semantics: <<<
`@* <- _` は以下と等価である:
  - `@session <- _`
  - `@scoped <- _`
すべてのスコープの全変数をクリアする
<<<
  ; 基本コマンド
  /begin {{
    :buffer        <- _
    :session_phase <- input
  }}

  /end {{ :session_phase <- waiting }}

  /exit {{
    @*             <- _
    :session_phase <- command
  }}

  ; 複数文を持つ定義
  /complex {{
    :temp          <- _
    :result        <- "value"
    :session_phase <- waiting
    ! "処理内容"
  }}

}}
```

**note**: v0.1.1 の文連続記号 (複数の文を `->` で並べる記法) は廃止しました。`->` を別名演算子へ転用したためです。文の境界は文法から決まり、区切りには空白類のいずれを使っても構いません ([01-syntax-core の 1.1.3 字句規則](./01-syntax-core.md#113-字句規則))。

### 合成 (旧 INSERT)

#### 合成の定義と合成例

```text
%define {{

  ; 元の定義
  /process {{
    ! "メイン処理"
  }}

  ; 前方への合成
  +/process ^ {{
    :prepared <- true
  }}

  ; 後方への合成
  +/process $ {{
    !#ProcessCompleted (result: :result)
  }}

  ; 合成結果: 前方 → 元の本体 → 後方

  ; ------------------------------------------------------------
  ; 複数の合成 (同一コマンドへの複数定義)
  ; ------------------------------------------------------------

  ; 第 1 前方合成 (最初に定義)
  +/process ^ {{
    :prepared <- true
    ! "事前処理1"
  }}

  ; 第 2 前方合成 (2 番目に定義)
  +/process ^ {{
    ! "事前処理2"
  }}

  ; 第 1 後方合成 (最初に定義)
  +/process $ {{
    ! "事後処理1"
  }}

  ; 第 2 後方合成 (2 番目に定義)
  +/process $ {{
    !#ProcessCompleted (result: :result)
    ! "事後処理2"
  }}

  ; 合成結果: AOP パターン (前方 = 逆順、後方 = 順順)
  ; 1. ! 事前処理2            (前方 #2 — 後に定義したものが先に実行)
  ; 2. :prepared <- true      (前方 #1)
  ; 3. ! 事前処理1            (前方 #1)
  ; 4. ! メイン処理           (元の本体)
  ; 5. ! 事後処理1            (後方 #1 — 先に定義したものが先に実行)
  ; 6. !#ProcessCompleted     (後方 #2)
  ; 7. ! 事後処理2            (後方 #2)

}}
```

#### 合成の実行規則と制約

```text
%rule {{

  rule composition execution order {{
    definition_order: <<<
insertion_sequence = [合成_1, 合成_2, ..., 合成_n]
insertion_sequence は定義の出現順に並ぶ
<<<

    forward_order: <<<
前方 (`^`) の実行順 (LIFO / スタック):
insertion_sequence を逆順にたどって本体を実行する
effect: "最後に定義したものが最初に実行される"
<<<

    backward_order: <<<
後方 (`$`) の実行順 (FIFO / キュー):
insertion_sequence を定義順にたどって本体を実行する
effect: "最初に定義したものが最初に実行される"
<<<

  }}
  rule composition {{
    execution_sequence: <<<
1. すべての前方合成を実行する (定義の逆順)
2. 元のコマンド本体を実行する
3. すべての後方合成を実行する (定義順)
<<<

    constraint sequentiality: <<<
すべての前方ブロックは元の本体が始まる前に完了しなければならない
元の本体はいずれかの後方ブロックが始まる前に完了しなければならない
インターリーブは許可されない
<<<

    note: <<<
この順序は一般的な AOP / ミドルウェアパターンと一致する:
- 前方 (`^`) = 前処理フック (最後に追加したフックが最初に実行)
- 後方 (`$`) = 後処理フック (最初に追加したフックが最初に実行)
<<<

  }}
  rule composition priority extension {{
    status:      "未実装"
    reservation: "優先度属性による明示的な順序制御"

    current_behavior: "実行順は定義順のみで決まる"

    reserved_syntax: <<<
+/cmd ^ --priority: <integer>: <body>
+/cmd $ --priority: <integer>: <body>
<<<

    reserved_semantics: <<<
execution_order: priority 値の昇順に並べる
higher_priority: lower_priority より先に実行する
priority_tie: 定義順にフォールバックする
<<<

    purpose: "構文を予約して将来の破壊的変更を防ぐ"

    note: <<<
この拡張は現在未実装である。
上の reserved_syntax は将来の拡張のための構文予約であり、
現在のパーサーはこの構文を受理しない。
<<<

  }}
  rule composition constraint composition {{
    syntax: "合成ブロックは constraint 句を含んでよい"

    composition_rule: <<<
original_constraints = 元の定義ブロックの制約
insert_constraints   = 合成ブロックの制約
composed_constraints = original_constraints ∪ insert_constraints

combined_constraint = and(composed_constraints)
<<<

    semantics: <<<
すべての制約が実行時に満たされなければならない
いずれかの制約に違反した場合、実行は禁止される
<<<

    %example composition_constraint -> "制約の合成" {{
      /process {{
        ! "処理を実行する"
        constraint: ":session_phase == waiting"
      }}

      +/process ^ {{
        :prepared <- true
        constraint: ":buffer が空でない"
      }}

      note: <<<
結果:
composed_constraints = :session_phase == waiting, :buffer が空でない
実行が許可されるのは、次を満たすとき、かつそのときに限る:
  :session_phase == waiting かつ :buffer が空でない
<<<

    }}
    note: <<<
制約は論理積で結合されるため、合成により制約は追加のみ可能で、
既存の制約を緩和することはできません。
<<<

  }}
}}
```

### イベントシステム

```text
%define {{

  ; イベント型定義
  #ProcessStarted     (command: text, mode: text) {{ }}
  #ProcessInterrupted (reason: text, previous_mode: text) {{ }}
  #ProcessCompleted   (result: text) {{ }}
  #ProcessFailed      (error: text) {{ }}
  #UserInputReceived  (input: text) {{ }}
  #InputCompleted     {{ }}
  #ErrorRecovered     {{ }}

  ; ハンドラが参照する変数
  @session :previous_mode {{ clearby: "/exit" }}
  @session :remark        {{ clearby: "/exit" }}

  ; イベント発火
  /start_process {{
    !#ProcessStarted (command: "/process", mode: :session_phase)
    ! "処理実行"
  }}

  ; リスナー登録
  <-#ProcessInterrupted {{
    :session_phase <- :previous_mode
    @scoped        <- _
  }}

}}
```

```text
%rule {{

  rule event_handler_session_phase_restriction {{
    constraint permitted_usage: <<<
イベントハンドラ内での `:session_phase <- ...` は次の用途に限定される:
  - restoration : 異常終了後に :previous_mode へ戻す
  - correction  : 処理が中断されたとき安全な状態へ遷移する
  - rollback    : エラー時に初期状態へ戻す
<<<
    constraint forbidden_usage: <<<
イベントハンドラ内での `:session_phase <- ...` を次の用途に使ってはならない:
  - normal_flow_control : コマンドで実装すべき通常の状態遷移
  - conditional_branching : 複数の遷移先から動的に選択する処理
  - arbitrary_transition : :session_phase の遷移規則を迂回する操作
<<<
    rationale: <<<
イベントハンドラは例外処理・エラー回復のためだけにある
通常の状態遷移はコマンドによって明示的に行わなければならない
この分離が制御フローの予測可能性を保つ
<<<

    %example permitted {{
      <-#ProcessInterrupted {{
        :session_phase <- :previous_mode    ; 復元のための使用
      }}

    }}
    %example forbidden {{
      <-#UserInputReceived {{
        :session_phase <- input             ; 通常フローはコマンドで行うべき
      }}

    }}
    enforcement: "llm は forbidden_usage に違反するイベントハンドラを拒否しなければならない"

  }}
}}
```

### 構文要素の意味

```text
%define {{

  ; :session_phase — 状態機械定義
  :session_phase {{
    command -> "コマンド"
    input   -> "入力"
    waiting -> "待機"

    :initial_session_phase <- command

    ; 許可された遷移。ここに現れない経路は禁止遷移である
    transitions {{
      command => input      ; /begin
      waiting => input      ; /begin
      input   => waiting    ; /end
      input   => command    ; /exit
      waiting => command    ; /exit
    }}
  }}

  ; `->` — 識別子の表示名定義
  rule alias operator {{
    syntax {{
      identifier -> "display_name"

    }}
    constraint identifier_format: <<<
identifier は ASCII 文字でなければならない
推奨形式: snake_case
<<<

    constraint display_name_format: <<<
display_name は任意の文字を含んでよい (日本語を含む)
display_name は表示のためだけに使う
<<<

    semantics: <<<
identifier   : コード参照・プログラム的アクセスに使う
display_name : llm の出力・人間可読な文脈に使う
<<<

    usage {{
      "コード参照"   => "identifier を使う"
      "llm の出力"   => "identifier より display_name を優先する"

    }}
    applicability: <<<
別名は次の場所で使える:
  - :session_phase の状態定義
  - 出力・位置定義の field 定義
  - 人間可読な表示名が必要な任意の識別子
<<<

    %example alias_operator {{
      :session_phase {{
        command -> "コマンド"
        input   -> "入力"
        waiting -> "待機"
      }}

      field finding_content: text
      field section_id: "<section-id>"

    }}
  }}
  ; イベント駆動システムの哲学
  rule event_session_phase_separation_of_concerns {{
    design_principle: "イベント (トリガー) と :session_phase (実行状態) の関心を明確に分離する"

    event_responsibility {{
      role: "通知のみ"
      purpose: <<<
- 処理の開始・完了・中断を知らせる
- イベントハンドラを起動する
<<<
      constraint: <<<
イベントが状態遷移を直接指示してはならない
イベントはトリガーであって制御装置ではない
<<<

    }}
    session_phase_responsibility {{
      role: "実行状態の表現"
      constraint: <<<
:session_phase は代入文によって明示的に変更されなければならない
暗黙の状態変更は禁止される
<<<

    }}
    handler_semantics: <<<
イベントハンドラ内での代入は許可される
解釈:
  誤: 「イベントが :session_phase を変える」(暗黙の因果)
  正: 「ハンドラが代入文を実行する」(明示的な操作)
<<<

    formalization {{
      <-#event_name {{
        :session_phase <- new_state    ; ハンドラによる明示的な代入操作
      }}

      note: <<<
event_name それ自体は :session_phase を変えない
ハンドラのコード (代入文) が :session_phase を変える
<<<

    }}
  }}
  ; コマンド定義 (`/` プレフィックス、パラメータ指定)
  /cmd <required_param> [<optional_param> ..] {{
    ! "コマンド実行"
  }}

  ; 変数宣言 (`:` プレフィックス、初期値設定可能)
  @session :example <- "initial_value" {{
    clearby: "/reset"
  }}

  ; 優先度レベル定義
  priority {{
    level: critical >> high >> medium >> low

    level_definitions: <<<
critical : 即座の対応が必要
high     : 優先的に対応
medium   : 通常の対応
low      : 後回しでよい
<<<

    rule priority positioning statement {{
      semantics: <<<
priority は適用可否や生成可否を決める条件ではない
priority は衝突解決のための選択指針である
<<<

      clarification: <<<
function_1     : 出力生成時に優先度レベルを表示する
function_2     : 複数の出力項目が衝突したときの重み付け機構
non_function_1 : priority は評価処理の実行順を制御しない
non_function_2 : priority は出力項目の適用可否を決めない
<<<

      note: <<<
correct_usage (例):
- 同一箇所に複数の出力項目が該当するとき、表示上 high より critical を優先する
- 出力フォーマット定義で priority フィールドの値を設定する
<<<

      note: <<<
incorrect_usage (例):
- priority = low だから評価をスキップする (実行順の制御)
- priority = high だから強制的に出力する (適用可否の決定)
<<<

    }}
    rule priority_essence_detailed {{
      essence: "priority は「同時に適用可能な規則どうしの衝突解決ヒューリスティクス」である"

      semantics {{
        ("複数の出力項目が衝突する") {{
          ! <<<
優先度の高い観点を選ぶ
<<<
        }}

        note: <<<
priority は評価の「重み」を表し、「順序」や「条件」ではない
priority は「衝突時の選択指針」であって適用順序ではない
<<<

      }}
    }}
    constraint priority semantic scope {{
      applicability: "priority は出力コンテキストでのみ有効な意味構造である"

      forbidden_usage: <<<
- 評価順の制御 (合成の順序制御に使わない)
- 実行条件の判定 (rule の真偽評価に使わない)
- コマンド実行の許可判定 (:session_phase の制約に使わない)
- 条件式の項 (位階軸 level を `>>` の項に置かない)
<<<

      note: <<<
level を位階として宣言するのは、衝突時にどちらが上位かを構造として残すためである
位階軸が条件式で使えるかどうかは軸ごとに定まる (03-semantics-core の位階の意味論を参照)
level はそのうち「置けない」側の軸である
<<<

      permitted_usage: <<<
- 出力定義における field の重要度表示
- 出力生成時の llm の判断基準
- 同時に適用可能な規則の衝突解決
<<<

    }}
    rule output context definition {{
      definition: <<<
「出力コンテキスト」とは次を指す:
  - 出力フォーマット定義における field の重要度表示
  - 処理コマンド (/process, /emit など) の出力
<<<

      scope: "priority はこれらの文脈でのみ参照される"

    }}
    rule priority vs rule disambiguation {{
      type_distinction {{
        priority => "優先度レベルの定義 (判断材料)"
        rule     => "制約・検証規則の定義 (構造的制約)"

      }}
      semantic_role: <<<
priority : llm に判断の指針を与える
rule     : 構造的制約を課す
<<<
    }}
  }}

  ; 出力フォーマット定義 (簡易版)
  %output result +location -> "処理結果" {{
    note: <<<
%output ブロックは、コマンドが生成する出力の形を定義する。
フィールドの並び・必須か任意か・値集合は、ドメインごとにプロファイルが定める。
コア仕様が定めるのは、%output という容器と修飾子の意味だけである。
<<<

    core_fields {{
      field content: text
      field importance: level    ; priority ブロックが宣言する位階軸
    }}

    note: <<<
constraint +location の効果:
<<<
    semantics: "+location 修飾はフィールドの自動追加を引き起こす"

    effect: <<<
auto_add: 位置定義に従って "location" フィールドを追加する
format: "section_name.node_type[N][.sentence[M]]"
<<<
  }}

  ; 文書位置識別構造 (field / rule で要素定義)
  location -> "文章位置" {{
    field section_id: "見出し[番号]"
    field node_type: "paragraph / list_item / heading / table / figure"
    rule sentence_delimiter: "句点 \"。\" / \"？\" / \"！\" / \":\""
  }}


  ; ------------------------------------------------------------
  ; <any-text> 系の制約と意味論
  ; ------------------------------------------------------------

  constraint any-text usage {{
    forbidden_operations: <<<
- 構文要素としての識別・比較・分岐
- 内容のプログラム的処理
<<<

    semantics: "<any-text> を構造的な制御フローに使ってはならない"

  }}
  rule any-text semantics {{
    definition: "<any-text> は構造的解釈を持たない自然言語テキストである"

    interpretation: <<<
llm の意味解析の対象である
実行時の制御フローの対象ではない
<<<

    formalization: <<<
<any-text> ∈ NaturalLanguage
<any-text> ∉ ProgrammaticControl
<<<

  }}
  constraint description usage {{
    forbidden_operations: "- 実行時判断・制御フロー・条件分岐"

    semantics: <<<
<description> は説明専用のテキストである
<description> は実行挙動に影響してはならない
<<<

  }}
  rule description semantics {{
    purpose: "<description> は llm への案内・指示のみを提供する"

    scope: <<<
applicable     : llm の理解と文脈
not_applicable : 実行制御・意思決定
<<<

  }}
  constraint label-text usage {{
    forbidden_operations: <<<
- 内部識別子としての使用
- 比較・検索キーとしての使用
<<<

    semantics: <<<
<label-text> は表示目的のみに使う
<label-text> をプログラム的ロジックに関与させてはならない
<<<

  }}
  rule label-text semantics {{
    purpose: "<label-text> は表示名のみである"

    usage_scope {{
      permitted: <<<
- 別名 (`->`) による日本語表示名
- 人間可読な出力のための field 名
<<<
      forbidden: <<<
- 内部シンボルの解決
- プログラム的なキー照合
<<<

    }}
  }}
  constraint free-text usage {{
    forbidden_operations: <<<
- 解析・構文分析
- 構造化データとしての扱い
<<<

    semantics: <<<
<free-text> は構造的解釈を持たない
<free-text> は DSL プロセッサにとって不透明である
<<<

  }}
  rule free-text semantics {{
    definition: "<free-text> は構造を持たない自由形式の内容である"

    purpose: "exclusive_use: heredoc による長文コンテンツ"

    scope: "<free-text> は構造的制約なしに叙述的な内容を提供する"

  }}
  rule any-text undefined behavior {{
    constraint prohibited_decision_usage: <<<
<any-text> 系の要素を次の判断基準に使ってはならない:
  - :session_phase の遷移
  - コマンド許可の判定
  - 条件分岐のロジック
<<<

    specification {{
      ("<any-text> を制御フローの判断に使った") {{
        semantics: <<<
挙動は未定義とする
結果は UndefinedBehavior となる
<<<
      }}

    }}
    formalization {{
      "control_flow_decision(<any-text>)" => UndefinedBehavior

    }}
  }}
  ; ------------------------------------------------------------
  ; constraint ラベル: 定義内制約の明示化
  ; ------------------------------------------------------------

  rule constraint label syntax {{
    placement: <<<
constraint は以下の位置に配置可能:
  - ブロック本体のどこでもよい (先頭・中程・末尾を問わない)
  - 複数の constraint を連続配置可能
  - 制約の対象と同じブロックの本体にあること
<<<

    format: <<<
constraint の本文は文字列リテラルまたは heredoc:
  - 単一の制約は文字列リテラル
  - 複数行にわたる制約は heredoc
  - 複数の制約を列挙するときは Markdown の箇条書き ("-" で始まる行)
<<<

    purpose: "同一ブロック内で定義と制約を自己記述する"

    %example constraint_label -> "constraint ラベルの配置" {{
      priority {{
        note: <<<
<レベルの説明>
<<<
        constraint: <<<
- 制約1
- 制約2
<<<
      }}
    }}

  }}
}}
```

### 停止条件・エラーハンドリング

```text
%rule {{

  rule termination_condition_specification {{
    semantics: "明示的な停止条件がない場合、実行文 (`!`) の停止は llm の判断に依存する"

    prompt_designer_responsibility: <<<
停止条件は次のいずれかで明示的に指定すべきである:
  - constraint ラベル: 実行制約を定義する
  - rule ラベル: 完了条件を記述する
  - イベント発火: 処理の終了を知らせる
<<<

    behavior {{
      ("停止条件が明示されている") {{
        ! <<<
条件が満たされるまで実行する
<<<
      }}
      () {{
        ! <<<
llm が文脈と暗黙知から停止を判断する
<<<
      }}

    }}
  }}
  rule insufficient_information_behavior {{
    precondition: "処理に必要な情報が欠けている"

    standard_protocol {{
      note: <<<
1. !#ProcessFailed を発火する
2. 欠けている情報を「Open Questions」として出力する
3. 不足している情報を :remark に記録する
4. :session_phase を安全な状態 (command または waiting) に戻す
<<<

    }}
    effect: "処理は、ユーザーが行動できるフィードバックを伴って穏当に終了する"

    %example insufficient_information -> "情報不足時のプロトコル" {{
      (":buffer が空") {{
        !#ProcessFailed (error: "入力内容が空です")
        ! "Open Questions: 対象テキストを入力してください"
        :session_phase <- command
      }}
    }}

    constraint safe_state_transition: "プロトコル完了後、:session_phase は command または waiting でなければならない"

  }}
  rule indeterminate_fallback_strategy {{
    precondition: "llm が適切な行動を決定できない"

    note: <<<
fallback_strategy (優先順):
1. constraint ラベルで定義された制約を確認する
2. :remark 変数の指示に従う
3. 保守的な既定を適用する (変更しない・出力しない)
4. 不確実であることを明示的に出力する
<<<

    behavior: "優先順位 1 から 4 まで順に試し、判断が得られた時点で実行して打ち切る"

    constraint conservative_principle: "既定の行動は破壊的な変更を導入してはならない"

  }}
  rule error_state_restoration {{
    precondition: "処理中にエラーが発生した"

    restoration_principles {{
      note: <<<
:execute_mode:
<<<
        (:execute_mode == processing) {{
          :execute_mode <- idle
        }}

      note: <<<
:session_phase:
:session_phase <- command または waiting
エラーの文脈に応じて選ぶ
<<<

      variable_scope_persistence: <<<
@session スコープの変数: 保持する
@scoped スコープの変数: 保持する (/begin が明示的にクリアする)
<<<

    }}
    exception forced_termination {{
      ("/exit コマンドを受けた") {{
        @* <- _
        note: <<<
すべての状態を初期値にリセットする
<<<
      }}

    }}
    effect: "ユーザーのデータを保ちながら、安全で回復可能な状態に戻る"

  }}
  rule reproducibility_guarantee {{
    goal {{
      "同一の入力 + 同一のプロンプト" => "同一の出力 (決定的な挙動)"

    }}
    constraint probabilistic_nature: "llm の確率的性質により、完全な再現性は保証されない"

    recommendation: <<<
重要な判断については:
  constraint / rule による明示的な指定を使う
  llm の暗黙の挙動に依存しない
<<<

    semantics: <<<
再現性はベストエフォートであり、保証されない
決定性には判断ロジックの明示的な指定が必要である
<<<

  }}
}}
```

### 非校閲領域 (最優先)

v0.3.0 までこの位置にあった `非校閲領域` の定義は、校閲レビュードメインに固有でした。v0.4.0 でコア仕様から削除しています。コア仕様が固まったのち、プロファイルとしてあらためて定義する予定です。

構文層での除外は [02-syntax-metablock](./02-syntax-metablock.md) のメタブロックが担います。

### フォールバック規則

llm が仕様を守らない場合の縮退動作を定義します。

#### コマンド解釈失敗時

| 状況               | フォールバック動作               | :session_phase / :execute_mode |
| ------------------ | -------------------------------- | ------------------------------ |
| コマンド不明       | 既定の動作に縮退                 | `:session_phase <- command`    |
| パラメータ欠落     | デフォルト値使用                 | 現状維持                       |
| コマンド構文エラー | エラー通知 → `/begin` 再入力促進 | `:session_phase <- command`    |

**フォールバック例**:

<!-- cspell:words reviw -->

```bash
/procss <typo>     → 既定モードに縮退、全セクション対象
/process Secton1   → Section1 を全セクション対象として処理
```

**note**: 縮退時は警告メッセージを出力します。ユーザー修正を促しますが処理は継続します。

#### 変数解決失敗時

| 状況         | フォールバック動作             | 出力形式               |
| ------------ | ------------------------------ | ---------------------- |
| 変数未定義   | `[UNRESOLVED:変数名]` 強制付与 | エラーマーカー表示     |
| 変数型不一致 | 文字列として扱う               | 型変換試行             |
| スコープ違反 | `@session` スコープで再検索    | 最大スコープにフォール |

**フォールバック例**:

```bash
:undefined_var   → "[UNRESOLVED:undefined_var]"
:buffer (未設定) → "[UNRESOLVED:buffer] (入力なし)"
```

**note**: `[UNRESOLVED:*]` マーカーは出力に含まれます。デバッグ・診断用途です。

#### 状態遷移違反時

| 状況                       | フォールバック動作                    | :session_phase / :execute_mode |
| -------------------------- | ------------------------------------- | ------------------------------ |
| 暗黙の :session_phase 遷移 | 遷移キャンセル → 警告出力             | 現状維持、`@session` 保持      |
| :execute_mode 再入         | 実行拒否 → エラー通知                 | 現状維持                       |
| 禁止遷移試行               | 遷移キャンセル → `transitions` を提示 | 現状維持                       |

**note**: 状態遷移違反は重大エラーです。処理を中断し、ユーザー介入を要求します。

#### output 生成失敗時

出力の生成に必要な情報が揃わないとき、llm は出力を捏造せず、欠けていることを明示します。

| 状況                           | フォールバック動作                                 |
| ------------------------------ | -------------------------------------------------- |
| 出力に必要な情報が不足している | 出力生成をスキップし、何が不足しているかを通知する |
| 値集合のどれにも当てはまらない | 判定不能を表す既定値を付与する                     |
| 位置情報を解決できない         | 位置が未解決であることを明示する                   |
| 識別子を生成できない           | 連番による自動識別子を割り当てる                   |

**note**: 判定不能時は保守的な既定値を採用します。過小評価より過大評価を優先します。

**note**: 既定値の具体的な名前 (どの値を「判定不能」とするか、識別子の採番規則など) はドメインごとに異なるため、プロファイルが定義します。コア仕様が定めるのは「捏造せず、欠落を明示する」という方針だけです。

#### 制約違反時の処理順序

1. constraint の確認
2. `:remark` の優先適用 (ユーザー指定)
3. フォールバック規則の適用
4. 保守的設定の採用

**constraint**: フォールバック規則の適用時も `:remark` > システムデフォルトの優先順位を維持します。

#### 実装例

```text
%define {{

  fallback ValidationFailed {{
    !#ProcessFailed (error: "[UNRESOLVED:buffer]")
    :session_phase <- command
    ! "Open Questions 出力: 必須情報が不足しています"
  }}

  fallback CommandNotFound {{
    ! "警告: 不明なコマンドを検出。既定の動作に縮退します"
    :session_phase <- command
    note: <<<
/process        ; 既定コマンドにフォールバック
<<<
  }}

}}
```

**note**: フォールバック定義は各プロンプトファイルで合成 (`+/cmd`) により拡張できます。プロンプト固有のフォールバック戦略を定義できます。

### Validation Conditions -> "検証条件"

```text
%define {{

  semantics: "仕様への適合を検証する方法"

  tests {{
    test session_phase_violation {{
      test_case 1: <<<
action: waiting 以外の状態で /process を実行する
expected: 明確に拒否される
<<<

      test_case 2: <<<
action: :execute_mode == processing の間に再入する
expected: 再入禁止が働く
<<<

    }}
    test session_phase_execute_mode_separation {{
      test_case 1: "check: :session_phase は 3 状態のみを持つ (command, input, waiting)"

      test_case 2: "check: :execute_mode の遷移は :session_phase == waiting のときにのみ起こる"

      test_case 3: "check: :session_phase と :execute_mode は独立に動作する"

    }}
    test composition_multiple {{
      test_case 1: <<<
check: 前方 ×2 / 後方 ×2 の順序が仕様どおりである
expected: 前方 = 逆順、後方 = 順順
<<<

    }}
    test any_text_misuse {{
      test_case 1: <<<
action: <description> に条件文を書く
expected: 無視される
<<<

      test_case 2: "check: 実行時の判断や制御に使われていない"

    }}
    test execute_mode_invisibility {{
      test_case 1: "check: :execute_mode == processing の間、ユーザー向けのテキスト出力がない"

      test_case 2: "check: 入力バッファが保留される"

    }}
  }}
  notes: "これらはすべて人間のレビューで検証できる"

}}
```
