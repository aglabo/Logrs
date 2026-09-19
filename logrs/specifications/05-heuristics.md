---
title: Part 3 — Heuristics -> "スタイル指針"
description: 命名規則、レイアウトの慣習、実行文の運用指針
version: 0.6.0
update: 2026-09-20
---

<!-- textlint-disable ja-technical-writing/sentence-length -->
<!-- textlint-disable ja-technical-writing/max-comma -->
<!-- markdownlint-disable line-length -->

[← 04-semantics-execution](./04-semantics-execution.md) | [索引](./README.md)

## Part 3: Heuristics -> "スタイル指針"

本ファイルは **例示部** です ([00-overview の規範と例示](./00-overview.md#規範と例示))。ここに書かれているのは慣習であって文法ではありません。従わなくても構文エラーにはなりません。

### Naming Conventions -> "命名規則"

```text
%rule {{

  naming-conventions {{
    semantics: "機械処理と llm の解釈のための識別子命名規則"

    identifier-types {{
      type ascii_id {{
        usage: "状態名、コマンド、変数、イベント、ペイロード"
        constraints {{
          character-set: "英数字 + ハイフン (\"-\") + アンダースコア (\"_\") のみ"
          recommended-style: "snake_case"
        }}
        examples {{
          session-phase: "command, input, waiting, processing"
          variable: "変数には \":\" プレフィックスが必須 (:buffer, :user_name)"
          event: "PascalCase を許可する (#ProcessStarted)"
        }}
      }}

      type label {{
        usage: "field, rule"
        constraints {{
          character-set: "日本語を許可する"
        }}
        examples {{
          field: "重要度, セクションID"
          rule: "優先度決定, 出力形式"
        }}
      }}
    }}

    alias-syntax {{
      semantics: "識別子に日本語の表示名を任意で付ける"
      syntax-pattern: "ascii_id [-> \"日本語表示名\"]"

      usage-guideline {{
        use: <<<
別名 (->) を使う場面:
  - ユーザーから見える状態名 (:session_phase, :acceptance, :execute_mode)
  - 主要なセクションの見出し
  - 日本語での補足が必要な重要概念
<<<
        omit: <<<
別名を省く場面:
  - 内部の規則名・制約名
  - 技術的な識別子
  - 説明不要な用語
<<<
      }}

      rules {{
        identifier: "常に ASCII"
        alias: "任意。使う場合は日本語を許可する"
        code-reference: "identifier (ascii_id) を使う"
        llm-output: "別名があればそれを優先し、なければ identifier を使う"
      }}
    }}
  }}

}}
```

### Style Guidelines -> "スタイル"

[01-syntax-core の 1.1.3 字句規則](./01-syntax-core.md#113-字句規則) のとおり、空白・タブ・改行はすべて等価な区切りであり、レイアウトに文法上の意味はありません。**したがって本節はすべて読みやすさのための慣習です。**

```text
%rule {{

  style-guidelines {{
    semantics: "DSL 定義の書式についての慣習"

    layout {{
      one-statement-per-line: <<<
1 つの文につき 1 行を使い、文の途中では改行しない。
文法上は自由だが、差分が読みやすくなる。
<<<
      indent: <<<
ブロックの入れ子 1 段につき空白 2 個で字下げする。
タブでも空白 4 個でも解釈は同じなので、
1 つのファイルの中で揃っていればよい。
<<<
      short-body: <<<
本体が単一の文なら、ヘッダと同じ行に納めてよい。
  @session :role {{ clearby: "/exit" }}
複数の文や入れ子のブロックを 1 行に詰めるのは避ける。
<<<
      block-form: <<<
本体が複数の文を持つなら、{{ を行末に、}} を行頭に置く。

  %define {{
    /begin {{
      :buffer        <- _
      :session_phase <- input
    }}
  }}
<<<
      alignment: <<<
代入演算子 <- を縦に揃えると、変数と値の対応が読み取りやすい。
揃えるための空白は何個でもよい。
<<<
    }}

    rationale: "レイアウトは llm と人間の読み取りやすさのためだけに存在する"
  }}

}}
```

### Execution Statement Operational Guidelines -> "実行文 (`!`) の運用指針"

```text
%rule {{

  execute-statement-guidelines {{
    semantics: "明確さと予測可能性を保つための、実行文 (!) の運用指針"

    design-intent: <<<
! "<指示>" は自然言語による処理記述を許可し、llm の柔軟な解釈を可能にする。
v0.4.0 では指示を必ず文字列リテラルか heredoc で囲む。
<<<

    operational-concerns {{
      risk verbosity {{
        problem: "自由記述のため、実行文が過度に長くなりうる"

        anti-pattern: <<<
; 非推奨: 長すぎる実行文
/process {{
  ! "buffer の内容を分析し、整合性を検証し、構成を評価し、改善案を生成し、:result に格納する"
}}
<<<

        recommended-pattern: <<<
; 推奨: 段階的な実行文
/process {{
  ! "buffer の整合性を検証する"
  ! "構成を評価する"
  ! "改善案を生成し :result に格納する"
}}
<<<

        guideline: "1 つの実行文は 1 つの明確な責務を持たなければならない"
      }}

      risk state_deviation {{
        problem: "実行文の自然言語記述が :session_phase の遷移と矛盾しうる"

        anti-pattern: <<<
; 危険: 実行文の中に暗黙の :session_phase 変更がある
/process {{
  ! "処理を実行し、完了したら入力モードに戻る"
}}
<<<

        recommended-pattern: <<<
; 安全: :session_phase の変更を明示する
/process {{
  ! "処理を実行する"
  :session_phase <- input
}}
<<<

        guideline: ":session_phase の遷移は必ず代入文で明示する"
      }}

      risk implicit_transition {{
        problem: "実行文の記述が「次の状態」を含意し、意図しない副作用を生む"

        anti-pattern: <<<
; 危険: 暗黙の事後条件
/validate {{
  ! "バリデーションを実行し、エラーがあれば停止する"
}}
<<<

        recommended-pattern: <<<
; 推奨: 明示的なイベント発火
/validate {{
  ! "バリデーションを実行する"
  constraint: "エラー発生時は #ProcessFailed を発火すること"
}}
<<<

        guideline: "停止条件とエラー処理は constraint とイベントで形式化しなければならない"
      }}
    }}

    best-practices -> "ベストプラクティス" {{
      principle conciseness: "実行文は 1 つの文字列に収まる長さにすべきである"
      principle explicitness: "副作用 (変数の変更、:session_phase の遷移) は別の文で表現しなければならない"
      principle verifiability: "重要な制約は constraint で明示しなければならない"

      good-design-example: <<<
/process <section> {{
  ! "buffer の <section> セクションを処理する"
  :result <- "処理結果"
  !#ProcessCompleted (result: :result)
  constraint: "session_phase == waiting でのみ実行可能、かつ buffer が空でないこと"
}}
<<<

      rationale: "実行内容が明確で検証可能である"
    }}
  }}

}}
```

### Anti-patterns -> "アンチパターン"

#### イベントハンドラによる状態遷移の誤用

````text
%rule {{

  anti_pattern event_handler_session_phase_misuse {{
    semantics: <<<
イベントハンドラ内での `:session_phase <- ...` は構文的には正当だが、
意味論的には限られた用途にのみ許される
<<<
    note: <<<
problem_essence -> "問題の本質":
イベントハンドラ内の代入は文法上は正しいが、
意味論的には特定の目的にのみ許可される
<<<

    forbidden_patterns -> "禁止パターン" {{

      pattern normal_flow_control {{
        anti_pattern {{
          note: <<<
```text
<<<
          ; 禁止: イベントで状態遷移を実現する
          <-#UserInputReceived {{
            :session_phase <- input
          }}
          note: <<<
```
<<<

        }}
        correct_pattern {{
          note: <<<
```text
<<<
          ; 正しい: コマンドで状態遷移を実現する
          /begin {{
            :session_phase <- input
            !#UserInputReceived
          }}
          note: <<<
```
<<<

        }}
        rationale: <<<
:session_phase の遷移はコマンドの責務である
イベントを副作用として扱うべきではない
<<<

      }}
      pattern conditional_branching {{
        anti_pattern {{
          note: <<<
```text
<<<
          ; 禁止: ペイロードに応じた動的な :session_phase 選択
          <-#ProcessCompleted {{
            ; 結果の内容に応じて :session_phase を変える
            :session_phase <- :next_mode
          }}
          note: <<<
```
<<<

        }}
        correct_pattern {{
          note: <<<
```text
<<<
          ; 正しい: コマンドで遷移先を明示的に決める
          /process <target_mode> {{
            ! "処理実行"
            :session_phase <- <target_mode>
            !#ProcessCompleted (result: :result)
          }}
          note: <<<
```
<<<

        }}
        rationale: ":session_phase の遷移規則を迂回すると状態機械の予測可能性が損なわれる"

      }}
      pattern arbitrary_transition {{
        anti_pattern {{
          note: <<<
```text
<<<
          ; 禁止: 定義された遷移を無視した遷移
          <-#CustomEvent {{
            :session_phase <- waiting    ; input => waiting (禁止された遷移) を実現している
          }}
          note: <<<
```
<<<

        }}
        correct_pattern {{
          note: <<<
```text
<<<
          ; 正しい: 定義された遷移経路を使う
          /end {{
            :session_phase <- waiting
            !#InputCompleted
          }}
          note: <<<
```
<<<

        }}
        rationale: <<<
定義された遷移制約 (`=>`) を守ることが設計の一貫性を保証する
<<<
      }}
    }}
    permitted_patterns -> "許可パターン: 復旧・補正・ロールバック" {{
      semantics: <<<
イベントハンドラ内での `:session_phase <- ...` はエラー回復のためだけに許可される
<<<
      permitted_cases {{
        case abnormal_termination_recovery {{
          note: <<<
```text
<<<
          ; 許可: 異常終了からの復旧
          <-#ProcessInterrupted {{
            :session_phase <- :previous_mode   ; 中断前の状態へ戻す
            @review        <- _
          }}
          note: <<<
```
<<<

        }}
        case error_rollback {{
          note: <<<
```text
<<<
          ; 許可: エラー時のロールバック
          <-#ProcessFailed {{
            :session_phase <- command          ; 初期状態へ戻す
            !#ErrorRecovered
          }}
          note: <<<
```
<<<

        }}
      }}
    }}
    note: <<<
guidelines -> "ガイドライン":
guideline 1 normal_flow -> "通常フロー":
  :session_phase の遷移はコマンドで行う

guideline 2 side_effect_recording -> "副作用記録":
  イベントは状態変化を**通知するだけ**である

guideline 3 recovery_processing -> "復旧処理":
  イベントハンドラ内の代入は例外処理に限定する

guideline 4 transition_rule_adherence -> "遷移規則遵守":
  遷移定義 (`=>`) が許可した経路のみを使う
<<<

    note: <<<
verification_method -> "検証方法":
step 1: "イベントハンドラ内のすべての `:session_phase <- ...` を探す"
step 2: "それぞれが復旧・補正・ロールバックの用途であることを確認する"
step 3: "通常フローの制御に使われていれば、コマンドへの移行を推奨する"
<<<

    rationale: "この制約は :session_phase 遷移の責務を明確にし、仕様の予測可能性を高める"

  }}
}}
````

**note**: v0.3.0 の「実務的ヒューリスティクス」(優先度決定ロジック、出力フォーマットの柔軟化) は、校閲レビュードメインに固有のため v0.4.0 で削除しました。コア仕様が固まったのち、プロファイルとしてあらためて定義する予定です。
