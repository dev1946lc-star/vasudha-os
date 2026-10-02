# Contributing to VASUDHA OS

<p align="center">
  <strong>How to Contribute to the Open-Source ERP Core</strong><br/>
  <em>Code of conduct, git branching, pull requests & review guidelines</em>
</p>

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Git Branching Strategy](#git-branching-strategy)
- [Pull Request & Review Guidelines](#pull-request--review-guidelines)
- [Local Setup & Environment](#local-setup--environment)

---

## Code of Conduct

We are committed to providing a welcoming, safe, and collaborative environment for all contributors, regardless of experience level, background, or identity. Respectful communication is required at all times.

---

## How Can I Contribute?

1.  **Reporting Bugs**: Create an issue detailing the bug, device details, and steps to reproduce. Attach logs if available.
2.  **Suggesting Enhancements**: Describe the feature, user value, and any proposed design layouts.
3.  **Submitting Code**: Pick an open issue, assign yourself, and submit a pull request against the `develop` branch.

---

## Git Branching Strategy

We follow a Git Flow model:

*   **`main`**: Production-ready code. Only merged from release/hotfix branches.
*   **`develop`**: Primary integration branch. All feature branches target `develop`.
*   **Feature Branches (`feature/`)**: Branch off `develop`. Format: `feature/{issue-number}-{short-description}`.
*   **Bugfix Branches (`bugfix/`)**: Branch off `develop` (or `main` for critical production hotfixes).

```
main       ===================================== (production release)
            ^
develop    ===================================== (active development)
            \                  /
feature/     `-- feature-123 --'
```

---

## Pull Request & Review Guidelines

1.  **Clean Code Check**: Ensure your code passes all static analysis checks. Run:
    ```bash
    flutter analyze
    ```
2.  **Tests Pass**: All unit and database integration tests must pass. Run:
    ```bash
    flutter test
    ```
3.  **Review Process**:
    *   Every pull request requires approval from at least one core maintainer.
    *   Address review feedback promptly. Squash commits before final merge.

---

## Local Setup & Environment

1.  Clone the repository and fetch dependencies:
    ```bash
    git clone https://github.com/vasudha-os/core.git
    cd core
    flutter pub get
    ```
2.  Initialize the build runner for Riverpod and Injectable code generators:
    ```bash
    flutter pub run build_runner build --delete-conflicting-outputs
    ```

---

<p align="center">
  <strong>Thank you for contributing to VASUDHA OS!</strong> 🚀
</p>
