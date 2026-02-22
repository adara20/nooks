# Rule: Generating a Task List from User Requirements

## Goal

To guide an AI assistant in creating a detailed, step-by-step task list in Markdown format based on user requirements, feature requests, or existing documentation. The task list should guide a developer through implementation with a focus on safety, isolation, and rigorous testing.

## Output

- **Format:** Markdown (`.md`)
- **Location:** `/tasks/`
- **Filename:** `tasks-[feature-name].md` (e.g., `tasks-user-profile-editing.md`)

## Process

1.  **Receive Requirements:** The user provides a feature request, task description, or points to existing documentation.
2.  **Analyze Requirements:** The AI analyzes the functional requirements, user needs, and implementation scope.
3.  **Phase 1: Generate Parent Tasks:** Create the high-level tasks. **IMPORTANT: Always include task 0.0 "Create feature branch" as the first task.** Use your judgement for additional tasks (typically 5). Present these to the user. Inform the user: "I have generated the high-level tasks. Ready for sub-tasks? Respond with 'Go' to proceed."
4.  **Wait for Confirmation:** Pause and wait for the user to respond with "Go".
5.  **Phase 2: Generate Sub-Tasks:** Once the user confirms, break down each parent task into smaller, actionable sub-tasks necessary to complete the parent task.
6.  **Identify Relevant Files:** Based on the tasks and requirements, identify potential files that will need to be created or modified. List these under the `Relevant Files` section, including corresponding test files if applicable.
7.  **Generate Final Output:** Combine the parent tasks, sub-tasks, relevant files, and notes into the final Markdown structure.
8.  **Save Task List:** Save the generated document in the `/tasks/` directory with the filename `tasks-[feature-name].md`.

## Output Format

The generated task list _must_ follow this structure:

```markdown
## Relevant Files

- `path/to/potential/file1.ts` - Brief description.
- `path/to/file1.test.ts` - Unit tests for `file1.ts`.

### Notes

- Unit tests should be alongside the code files.
- Use `npm test` or `npx vitest` to run tests.

## Instructions for Completing Tasks

**IMPORTANT:** Change `- [ ]` to `- [x]` as you complete tasks.

**Mandatory Workflow Rules:**
1.  **Feature Isolation:** You **MUST** ensure new features are isolated and do not break or alter existing functionality. Verify this by running the full suite of existing tests.
2.  **Continuous Verification:** You **MUST** run **ALL** unit tests after completing **each sub-task**. If any test fails (new or existing), you must fix it before proceeding.
3.  **Zero-Threshold Verification:** Every single code modification—regardless of how small—**MUST** be followed by a type-check (`npx tsc --noEmit`) and, if it involves logic or UI rendering, a corresponding test run. NEVER assume a "one-liner" is safe.
4.  **Extensive Testing:** For every new task, sub-task, or piece of logic, you **MUST** write extensive unit tests to cover:
    - **Success cases & Edge cases** (e.g., whitespace handling, case-insensitivity).
    - **Migration Paths:** If changing the database schema, you **MUST** write a migration test that simulates upgrading from a legacy version to the new version to prevent "UpgradeError" or data loss.
    - **Derived State:** If a change affects historical data, verify that derived stats (like PRs or timestamps) recalculate correctly across the whole dataset.
4.  **Type Safety:** You **MUST** run `npx tsc --noEmit` (or the project's equivalent type check) after every major sub-task to ensure no syntax or type regressions.
5.  **Git Safety & No Remote Push:** **NEVER** push to a remote repository (`git push`) without explicit human verification and confirmation of the changes. Always work on a local feature branch.
6.  **Local Commits:** Commit locally after each successful parent task is verified and approved by the user.

## Tasks

- [ ] 0.0 Create feature branch
  - [ ] 0.1 Create and checkout a new branch (e.g., `git checkout -b feature/[feature-name]`)
- [ ] 1.0 Parent Task Title
  - [ ] 1.1 [Sub-task description 1.1]
  - [ ] 1.2 [Sub-task description 1.2]
  - [ ] 1.3 **Verify & Test:** Run ALL unit tests and check coverage (`npx vitest run --coverage`). Add extensive new tests for any added logic. Ensure no regressions and maintain >85% overall coverage.
  - [ ] 1.4 **Human Review:** Ask the user if this task is complete and for permission to move to the next task.
  - [ ] 1.5 **Local Commit:** Commit changes locally (`git commit -m "..."`) after approval.
- [ ] 2.0 Parent Task Title
  - [ ] 2.1 [Sub-task description 2.1]
  - [ ] 2.2 **Verify & Test:** Run ALL unit tests, add extensive tests, and ensure isolation.
  - [ ] 2.3 **Human Review & Local Commit**
- [ ] 3.0 Finalize & Cleanup
  - [ ] 3.1 **Architecture Sync:** Update `ARCHITECTURE.md` if any system-wide patterns or schemas were changed.
  - [ ] 3.2 **PR Request:** Ask the user if a PR should be created.
  - [ ] 3.2 **Push:** Push the local branch to the remote repository.
  - [ ] 3.3 **Cleanup:** Once the user confirms the PR is merged, delete local/remote branches and remove task artifacts from the `tasks/` directory.
```

## Interaction Model

The process explicitly requires a pause after generating parent tasks to get user confirmation ("Go") before proceeding to generate the detailed sub-tasks.

## Target Audience

Assume the reader is a **junior developer** implementing the feature. Requirements must be explicit, unambiguous, and focused on maintaining system stability.