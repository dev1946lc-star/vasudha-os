# VASUDHA OS — Security Architecture

<p align="center">
  <strong>Security by Design for Financial Data Protection</strong><br/>
  <em>Comprehensive security measures for an offline-first mobile ERP</em>
</p>

---

## Table of Contents

- [Security Philosophy](#security-philosophy)
- [Threat Model](#threat-model)
- [Data Encryption](#data-encryption)
- [Secure Storage](#secure-storage)
- [Input Validation](#input-validation)
- [SQL Injection Prevention](#sql-injection-prevention)
- [Application Security](#application-security)
- [Device Security](#device-security)
- [Network Security (v2.0)](#network-security-v20)
- [Data Privacy & Compliance](#data-privacy--compliance)
- [Security Audit Checklist](#security-audit-checklist)
- [Incident Response Plan](#incident-response-plan)
- [Vulnerability Disclosure Policy](#vulnerability-disclosure-policy)

---

## Security Philosophy

VASUDHA OS handles **sensitive financial and business data** — billing records, payment transactions, customer information, and business intelligence. Security is not an afterthought; it is a core architectural principle.

### Security Principles

1. **Defense in Depth** — Multiple layers of security; no single point of failure
2. **Least Privilege** — Users and modules get minimum required access
3. **Secure by Default** — Security features are enabled by default, not opt-in
4. **Data Minimization** — Collect only what's needed; retain only what's required
5. **Transparency** — All actions are auditable; every change is logged
6. **Zero Trust (Future)** — Verify every request, even from internal modules (cloud phase)

### Security Layers

```
Layer 1: Physical Device Security
    ├── Device PIN/Pattern/Biometric (OS-level)
    └── Screen lock enforcement

Layer 2: Application Authentication
    ├── App-level PIN / Biometric
    ├── Session management
    └── Account lockout policy

Layer 3: Authorization (RBAC)
    ├── Role-based module access
    ├── Action-level permissions
    └── Data-level access control

Layer 4: Data Protection
    ├── Database encryption (SQLCipher)
    ├── Secure key storage
    └── Sensitive field encryption

Layer 5: Input Security
    ├── Input validation
    ├── SQL injection prevention
    └── Data sanitization

Layer 6: Audit & Monitoring
    ├── Complete audit trail
    ├── Anomaly detection (future)
    └── Security event logging
```

---

## Threat Model

### STRIDE Analysis

| Threat | Category | Risk | Mitigation |
|--------|----------|------|------------|
| Unauthorized app access | **S**poofing | High | PIN auth, biometric, auto-lock |
| Data modification by malicious user | **T**ampering | High | RBAC, audit trail, data validation |
| Denying a collection/payment | **R**epudiation | Medium | Immutable audit log, timestamps |
| Sensitive data exposure | **I**nformation Disclosure | High | Encryption at rest, secure storage |
| App crash causing data loss | **D**enial of Service | Medium | Transactions, backup strategy |
| Agent accessing admin functions | **E**levation of Privilege | High | RBAC, permission checks |

### Asset Classification

| Asset | Sensitivity | Protection Required |
|-------|-------------|-------------------|
| Financial records (bills, payments) | **Critical** | Encryption, audit, access control |
| Customer data (restaurants, contacts) | **High** | Encryption, access control |
| Business intelligence (reports, analytics) | **High** | Access control, export restrictions |
| User credentials (PINs) | **Critical** | Hashing, secure storage |
| Company configuration | **Medium** | Access control |
| Application settings | **Low** | Backup |

### Threat Actors

| Actor | Motivation | Capability | Mitigation |
|-------|-----------|------------|------------|
| Disgruntled employee | Fraud, data theft | App access, device access | RBAC, audit, account revocation |
| Lost/stolen device | Data theft | Physical device access | Encryption, remote wipe (future) |
| Competitor | Business intelligence | Limited | Data encryption, access control |
| Malware | Data exfiltration | Device-level access | Encryption at rest, secure storage |
| Insider (collection agent) | Manipulation of records | App access (limited role) | Verification workflow, audit |

---

## Data Encryption

### Encryption at Rest

#### SQLite Database Encryption

```dart
// Using SQLCipher for AES-256 encryption
import 'package:sqflite_sqlcipher/sqflite.dart';

class DatabaseHelper {
  static Future<Database> initialize() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'vasudha.db');

    return openDatabase(
      path,
      password: await _getDatabaseKey(),  // Encryption key
      version: MigrationRunner.currentVersion,
      onCreate: MigrationRunner.create,
      onUpgrade: MigrationRunner.migrate,
      onConfigure: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
      },
    );
  }

  /// Derive encryption key from user PIN + device identifier
  static Future<String> _getDatabaseKey() async {
    final deviceId = await _getDeviceId();
    final storedKey = await secureStorage.read(key: 'db_key');

    if (storedKey != null) return storedKey;

    // Generate a new key on first run
    final key = _deriveKey(deviceId);
    await secureStorage.write(key: 'db_key', value: key);
    return key;
  }
}
```

#### Encryption Specifications

| Aspect | Specification |
|--------|--------------|
| Algorithm | AES-256-CBC (via SQLCipher) |
| Key Derivation | PBKDF2 with SHA-256 |
| Key Length | 256 bits |
| Iterations | 256,000 (SQLCipher default) |
| Page Size | 4096 bytes |
| HMAC | SHA-512 for tamper detection |

### Sensitive Field Encryption

Fields requiring additional encryption beyond database-level:

| Field | Encryption | Storage |
|-------|-----------|---------|
| User PIN hash | bcrypt (10 rounds) | Database |
| Database encryption key | AES-256 | Flutter Secure Storage (Keystore/Keychain) |
| API tokens (future) | AES-256 | Flutter Secure Storage |
| Biometric key | Hardware-backed | Android Keystore / iOS Keychain |

---

## Secure Storage

### Flutter Secure Storage

```dart
// Using flutter_secure_storage for sensitive values
final secureStorage = FlutterSecureStorage(
  aOptions: AndroidOptions(
    encryptedSharedPreferences: true,
    keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_OAEPwithSHA_256andMGF1Padding,
    storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
  ),
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
);
```

### What Goes Where

| Data | Storage | Reason |
|------|---------|--------|
| User preferences (theme, language) | SharedPreferences | Non-sensitive |
| Cached computations | Hive (unencrypted) | Non-sensitive, regenerable |
| Transaction data | SQLite (encrypted) | Sensitive financial data |
| Database encryption key | Secure Storage | Critical secret |
| User PIN hash | SQLite (encrypted) | Sensitive credential |
| Session token | Secure Storage | Authentication material |
| API keys (future) | Secure Storage | Critical secret |
| Generated PDFs | App-private directory | Business documents |
| Backup files | User-accessible directory | User-controlled |

---

## Input Validation

### Validation Strategy

All input is validated at **two levels**:

1. **UI Layer** — Real-time validation as user types (UX feedback)
2. **Domain Layer** — Business rule validation before any database write (ground truth)

### Validation Rules

#### Text Input Sanitization

```dart
class InputSanitizer {
  /// Remove control characters and trim whitespace
  static String sanitize(String input) {
    return input
        .replaceAll(RegExp(r'[\x00-\x1F\x7F]'), '') // Remove control chars
        .replaceAll(RegExp(r'<[^>]*>'), '')           // Strip HTML tags
        .trim();
  }

  /// Sanitize for SQL safety (backup defense)
  static String sanitizeForSql(String input) {
    return input
        .replaceAll("'", "''")  // Escape single quotes
        .replaceAll(';', '')     // Remove semicolons
        .trim();
  }
}
```

#### Field-Level Validation

| Field Type | Validation | Pattern |
|-----------|-----------|---------|
| Mobile Number | 10 digits, starts with 6-9 | `^[6-9]\d{9}$` |
| Email | Standard email format | RFC 5322 compliant |
| GSTIN | 15 chars, specific format | `^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$` |
| PAN | 10 chars, specific format | `^[A-Z]{5}\d{4}[A-Z]$` |
| PIN Code | 6 digits | `^\d{6}$` |
| Amount | Positive, max 12 digits, 2 decimal | `^\d{1,10}(\.\d{1,2})?$` |
| Quantity | Positive, max 12 digits, 3 decimal | `^\d{1,9}(\.\d{1,3})?$` |
| User PIN | 4-6 digits | `^\d{4,6}$` |
| HSN Code | 4-8 digits | `^\d{4,8}$` |

---

## SQL Injection Prevention

### Primary Defense: Parameterized Queries

```dart
// ✅ ALWAYS use parameterized queries
final results = await db.query(
  'restaurants',
  where: 'name LIKE ? AND status = ? AND deleted_at IS NULL',
  whereArgs: ['%$searchTerm%', 'active'],
);

// ✅ For raw SQL, use ? placeholders
final results = await db.rawQuery(
  'SELECT r.*, COUNT(c.id) as collection_count '
  'FROM restaurants r '
  'LEFT JOIN collections c ON r.id = c.restaurant_id '
  'WHERE r.company_id = ? AND r.deleted_at IS NULL '
  'GROUP BY r.id',
  [companyId],
);

// ❌ NEVER concatenate user input into SQL
// final results = await db.rawQuery(
//   "SELECT * FROM restaurants WHERE name = '$userInput'"  // VULNERABLE!
// );
```

### Secondary Defense: Input Validation

All user inputs are validated and sanitized before reaching the data layer:

1. **Type checking** — Amounts are parsed as doubles, IDs are validated as UUIDs
2. **Length limits** — All text fields have maximum lengths
3. **Character filtering** — Control characters and SQL metacharacters are stripped
4. **Whitelist validation** — Enums are validated against allowed values

---

## Application Security

### Build Security

| Measure | Implementation |
|---------|---------------|
| Code obfuscation | `flutter build apk --obfuscate --split-debug-info=...` |
| ProGuard/R8 | Android minification and shrinking |
| Debug detection | Disable sensitive features in debug mode |
| Root/Jailbreak detection | Warn users on rooted devices (informational) |
| Tamper detection | Verify app signature at runtime (future) |

### Session Security

```dart
class SessionManager {
  static const int sessionTimeoutMinutes = 5;
  static const int maxLoginAttempts = 5;
  static const int lockDurationMinutes = 15;

  DateTime? _lastActivityAt;

  bool get isSessionExpired {
    if (_lastActivityAt == null) return true;
    return DateTime.now().difference(_lastActivityAt!) >
        Duration(minutes: sessionTimeoutMinutes);
  }

  void recordActivity() {
    _lastActivityAt = DateTime.now();
  }

  bool shouldLockAccount(int failedAttempts) {
    return failedAttempts >= maxLoginAttempts;
  }
}
```

### Secure Code Practices

| Practice | Implementation |
|----------|---------------|
| No hardcoded secrets | All secrets in Secure Storage or env vars |
| No logging of sensitive data | PIN, tokens, financial details never logged |
| Memory cleanup | Clear sensitive data from memory after use |
| Secure random numbers | Use `dart:math.Random.secure()` for security-critical values |
| Dependency scanning | Regular audit of third-party packages |

---

## Device Security

### Android Security

| Feature | Implementation |
|---------|---------------|
| App data directory | Private, not accessible by other apps |
| Backup prevention | `android:allowBackup="false"` in manifest |
| Export prevention | Activities not exported unless necessary |
| Network security config | Certificate pinning (v2.0) |
| Screenshot prevention | `FLAG_SECURE` on sensitive screens |

### iOS Security

| Feature | Implementation |
|---------|---------------|
| App Transport Security | HTTPS only (v2.0) |
| Keychain storage | Sensitive data in Keychain |
| Data protection | Complete protection until first unlock |
| Background screenshot | Blur sensitive content on app switch |

---

## Network Security (v2.0)

### Transport Security

| Measure | Implementation |
|---------|---------------|
| TLS version | TLS 1.3 minimum |
| Certificate pinning | Pin server certificate in app |
| HSTS | Strict Transport Security headers |
| API authentication | JWT with short expiry (15 min) + refresh tokens |

### API Security

| Measure | Implementation |
|---------|---------------|
| Rate limiting | Per-endpoint rate limits |
| Request signing | HMAC-SHA256 signature on critical endpoints |
| Input validation | Server-side validation (defense in depth) |
| CORS | Restricted to known origins |
| Content Security Policy | Strict CSP headers |

---

## Data Privacy & Compliance

### Personal Data Handling

| Data Type | Classification | Retention | Deletion |
|-----------|---------------|-----------|----------|
| Customer names & contacts | Personal | Active + 7 years | Soft delete + anonymize |
| Financial transactions | Business + Legal | Active + 8 years (IT Act) | Archive after retention |
| User credentials | Sensitive | Active | Hard delete on account removal |
| Audit logs | Legal | Active + 10 years | Read-only, no deletion |
| App usage analytics | Pseudonymized | 2 years | Auto-purge |

### Regulatory Compliance

| Regulation | Requirement | Implementation |
|-----------|-------------|---------------|
| **IT Act 2000** (India) | Reasonable security practices | Encryption, access control, audit |
| **GST Compliance** | Invoice retention for 6 years | Database retention policy |
| **FSSAI** | License tracking and compliance | Document storage and alerts |
| **DPDP Act 2023** (India) | Personal data protection | Consent, data minimization, rights |

### User Rights

| Right | Implementation |
|-------|---------------|
| Right to Access | Export all personal data (Settings → Export Data) |
| Right to Correction | Edit personal details anytime |
| Right to Erasure | Request data deletion (anonymize, don't delete financial records) |
| Right to Portability | Export data in standard formats (CSV, JSON) |

---

## Security Audit Checklist

### Pre-Release Security Review

- [ ] All user inputs validated at UI and domain layers
- [ ] All database queries use parameterized statements
- [ ] No sensitive data in application logs
- [ ] Database encrypted with SQLCipher
- [ ] Encryption keys stored in platform Secure Storage
- [ ] User PINs stored as bcrypt hashes
- [ ] Session timeout implemented and tested
- [ ] Account lockout after max failed attempts
- [ ] Role-based access control enforced on all modules
- [ ] Audit trail logging for all data modifications
- [ ] Release build obfuscated
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] Third-party dependencies audited for vulnerabilities
- [ ] Backup files encrypted or in protected directory
- [ ] Screenshot prevention on sensitive screens

### Periodic Security Review (Quarterly)

- [ ] Review and update third-party package versions
- [ ] Review audit logs for suspicious activity patterns
- [ ] Test account lockout and session timeout
- [ ] Verify encryption key rotation process
- [ ] Review user access permissions for appropriateness
- [ ] Test backup/restore with encrypted database
- [ ] Penetration testing on cloud API (v2.0)

---

## Incident Response Plan

### Severity Classification

| Severity | Description | Response Time | Example |
|----------|-------------|--------------|---------|
| **Critical** | Data breach, financial data exposure | < 1 hour | Database encryption compromised |
| **High** | Authentication bypass, privilege escalation | < 4 hours | Role bypass vulnerability |
| **Medium** | Data integrity issue, minor info leak | < 24 hours | Incorrect permission check |
| **Low** | Informational, best practice violation | < 1 week | Debug info in release build |

### Response Steps

1. **Detect** — Identify the security incident (monitoring, user report, audit)
2. **Contain** — Prevent further damage (disable affected feature, revoke access)
3. **Assess** — Determine scope and impact
4. **Remediate** — Fix the vulnerability
5. **Recover** — Restore affected data/systems
6. **Report** — Document the incident and lessons learned
7. **Improve** — Update security measures to prevent recurrence

---

## Vulnerability Disclosure Policy

### Responsible Disclosure

If you discover a security vulnerability in VASUDHA OS:

1. **Do NOT** disclose publicly before a fix is available
2. **Email** security@vasudha-os.com with details
3. **Include**: Description, steps to reproduce, impact assessment
4. **Response**: Acknowledgment within 24 hours; fix timeline within 72 hours
5. **Credit**: Security researchers will be credited (if desired)

### Bounty Program (Future)

| Severity | Bounty |
|----------|--------|
| Critical | ₹25,000 – ₹1,00,000 |
| High | ₹10,000 – ₹25,000 |
| Medium | ₹5,000 – ₹10,000 |
| Low | Acknowledgment + Swag |

---

<p align="center">
  <strong>VASUDHA OS Security</strong> — Protecting India's supply chain data. 🔒
</p>
