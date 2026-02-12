# Contributing to TEFAS Fund Dashboard

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## 📋 Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Pre-commit Hooks](#pre-commit-hooks)

## 🚀 Development Setup

### Prerequisites

- Node.js 18+ and npm
- Python 3.8+
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/fatihustun/foncu.git
cd foncu
```

### 2. Set Up Environment Variables

```bash
# Copy example files
cp .env.example .env
cp frontend/.env.example frontend/.env

# Edit the files with your actual Supabase credentials
# Root .env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DB_PASSWORD
# Frontend .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

### 3. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 4. Install Python Dependencies

```bash
cd ..
pip install -e ".[dev]"
```

### 5. Run Development Servers

```bash
# Terminal 1: Frontend
cd frontend
npm run dev

# Terminal 2: API (if running locally)
cd api
npm install
npm run dev
```

## 🎨 Code Style

### TypeScript/JavaScript (Frontend)

We use **ESLint** and **Prettier** for code formatting:

```bash
# Check for linting errors
cd frontend
npm run lint

# Fix auto-fixable linting errors
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting without fixing
npm run format:check
```

**Key Style Rules:**
- Use single quotes
- 2-space indentation
- Max line length: 100 characters
- Semicolons required
- Use TypeScript strict mode
- Avoid `any` types

### Python

We use **Black**, **Flake8**, and **Pylint**:

```bash
# Format code
black tefas tests

# Check with flake8
flake8 tefas tests --max-line-length=88

# Check with pylint
pylint tefas
```

**Key Style Rules:**
- Max line length: 88 (Black default)
- Use type hints where possible
- Follow PEP 8 naming conventions
- Add docstrings to public functions/classes

## 🧪 Testing

### Frontend Tests

We use **Jest** and **React Testing Library**:

```bash
cd frontend

# Run tests once
npm test

# Run tests in watch mode (development)
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

**Writing Tests:**
- Place tests in `src/__tests__/` directory
- Name files: `ComponentName.test.tsx` or `utility.test.ts`
- Test behavior, not implementation details
- Use `screen` queries from `@testing-library/react`

Example:
```typescript
import { render, screen } from '@testing-library/react';
import { Component } from '../components/Component';

describe('Component', () => {
  it('renders correctly', () => {
    render(<Component />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Python Tests

We use **pytest**:

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=tefas --cov-report=html

# Run specific test file
pytest tests/test_crawler.py
```

## 🔄 Pull Request Process

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

2. **Make Your Changes**
   - Write clear, concise commit messages
   - Follow the code style guidelines
   - Add tests for new functionality

3. **Run Quality Checks**
   ```bash
   # Frontend
   cd frontend
   npm run lint
   npm run test
   
   # Python
   cd ..
   black tefas tests
   flake8 tefas tests
   pytest
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```
   
   Use conventional commit prefixes:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `test:` - Adding tests
   - `refactor:` - Code refactoring
   - `security:` - Security improvements

5. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   
   Then create a Pull Request on GitHub with:
   - Clear title and description
   - Reference any related issues
   - Screenshots (if UI changes)

## 🪝 Pre-commit Hooks

We use **pre-commit** to run checks before each commit:

### Installation

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install
```

### What Hooks Do

- Trim trailing whitespace
- Fix end-of-file issues
- Check YAML/JSON syntax
- Run Black (Python formatting)
- Run Flake8 (Python linting)
- Run ESLint (TypeScript/JavaScript)
- Check for secrets
- Prevent commits to main branch

### Running Hooks Manually

```bash
# Run on all files
pre-commit run --all-files

# Run on staged files only
pre-commit run
```

## 🔒 Security

- Never commit `.env` files with real credentials
- Never hardcode API keys or secrets
- Use environment variables for all sensitive data
- Run `detect-secrets` before committing

## 📝 Documentation

- Update README.md if adding new features
- Update this file if changing development workflow
- Add JSDoc comments to functions and components
- Add docstrings to Python functions and classes

## ❓ Questions?

- Open an issue for bugs
- Start a discussion for feature requests
- Check existing issues/PRs before creating new ones

## 🙏 Thank You!

Every contribution helps make this project better. We appreciate your time and effort!
