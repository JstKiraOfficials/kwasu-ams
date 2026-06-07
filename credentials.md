# KWASU AMS — Seed Credentials

All accounts use the same password:

**Password for all accounts:** `TestPassword123!`

Run `pnpm --filter @kwasu-ams/api db:seed` to populate the database before using these credentials.

---

## Staff Accounts (Ready to use — no first-login redirect)

These accounts have `mustChangePassword: false` and `totpEnrolled: true`. They log straight in, skip password change, and skip TOTP setup.

| Role                 | Identifier             | Scope                     |
| -------------------- | ---------------------- | ------------------------- |
| Super Admin          | `KWASU/ADM/SYS/00001`  | System-wide               |
| Academic Affairs     | `KWASU/AFF/ACA/00001`  | System-wide               |
| Vice Chancellor      | `KWASU/VC/EXEC/00001`  | System-wide               |
| Dean of Sciences     | `KWASU/DEAN/SCI/00001` | Faculty of Sciences       |
| HOD Computer Science | `KWASU/HOD/CSC/00001`  | Dept. of Computer Science |
| Exam Officer         | `KWASU/EXM/REG/00001`  | System-wide               |
| Lecturer (Biology)   | `KWASU/LEC/BIO/00001`  | Dept. of Biology          |

---

## Student Accounts (Special)

| Identifier       | mustChangePassword | totpEnrolled | Programme              | Level | Notes                                         |
| ---------------- | ------------------ | ------------ | ---------------------- | ----- | --------------------------------------------- |
| `20/47CSC/00001` | `false`            | `false`      | B.Sc. Computer Science | 100   | Skips password change, still needs TOTP setup |
| `20/47CSC/00005` | `false`            | `true`       | B.Sc. Computer Science | 100   | Fully ready — no redirects                    |

---

## First-Login Accounts (will redirect through change-password → setup-totp)

### Lecturers

| Identifier            | Department        | Faculty                        |
| --------------------- | ----------------- | ------------------------------ |
| `KWASU/LEC/BIO/00002` | Biology           | Faculty of Sciences            |
| `KWASU/LEC/CHM/00003` | Chemistry         | Faculty of Sciences            |
| `KWASU/LEC/CHM/00004` | Chemistry         | Faculty of Sciences            |
| `KWASU/LEC/CSC/00005` | Computer Science  | Faculty of Sciences            |
| `KWASU/LEC/CSC/00006` | Computer Science  | Faculty of Sciences            |
| `KWASU/LEC/CSC/00099` | Computer Science  | Faculty of Sciences            |
| `KWASU/LEC/MTH/00007` | Mathematics       | Faculty of Sciences            |
| `KWASU/LEC/MTH/00008` | Mathematics       | Faculty of Sciences            |
| `KWASU/LEC/ENG/00009` | English           | Faculty of Arts and Humanities |
| `KWASU/LEC/ENG/00010` | English           | Faculty of Arts and Humanities |
| `KWASU/LEC/HIS/00011` | History           | Faculty of Arts and Humanities |
| `KWASU/LEC/HIS/00012` | History           | Faculty of Arts and Humanities |
| `KWASU/LEC/PHI/00013` | Philosophy        | Faculty of Arts and Humanities |
| `KWASU/LEC/PHI/00014` | Philosophy        | Faculty of Arts and Humanities |
| `KWASU/LEC/ECO/00015` | Economics         | Faculty of Social Sciences     |
| `KWASU/LEC/ECO/00016` | Economics         | Faculty of Social Sciences     |
| `KWASU/LEC/POL/00017` | Political Science | Faculty of Social Sciences     |
| `KWASU/LEC/POL/00018` | Political Science | Faculty of Social Sciences     |
| `KWASU/LEC/SOC/00019` | Sociology         | Faculty of Social Sciences     |
| `KWASU/LEC/SOC/00020` | Sociology         | Faculty of Social Sciences     |

### Students (sample — 200 total in seed)

| Identifier       | Programme               | Level |
| ---------------- | ----------------------- | ----- |
| `20/47CSC/00001` | B.Sc. Computer Science  | 100   |
| `21/47CSC/00002` | B.Sc. Computer Science  | 100   |
| `22/47CSC/00003` | B.Sc. Computer Science  | 100   |
| `23/47CSC/00004` | B.Sc. Computer Science  | 100   |
| `20/12BIO/00021` | B.Sc. Biology           | 100   |
| `21/12BIO/00022` | B.Sc. Biology           | 100   |
| `22/12BIO/00023` | B.Sc. Biology           | 100   |
| `23/12BIO/00024` | B.Sc. Biology           | 100   |
| `20/8CHM/00041`  | B.Sc. Chemistry         | 100   |
| `21/8CHM/00042`  | B.Sc. Chemistry         | 100   |
| `20/4MTH/00061`  | B.Sc. Mathematics       | 100   |
| `21/4MTH/00062`  | B.Sc. Mathematics       | 100   |
| `20/15ENG/00081` | B.A. English            | 100   |
| `21/15ENG/00082` | B.A. English            | 100   |
| `20/6HIS/00101`  | B.A. History            | 100   |
| `21/6HIS/00102`  | B.A. History            | 100   |
| `20/9PHI/00121`  | B.A. Philosophy         | 100   |
| `21/9PHI/00122`  | B.A. Philosophy         | 100   |
| `20/11ECO/00141` | B.Sc. Economics         | 100   |
| `21/11ECO/00142` | B.Sc. Economics         | 100   |
| `20/7POL/00161`  | B.Sc. Political Science | 100   |
| `21/7POL/00162`  | B.Sc. Political Science | 100   |
| `20/3SOC/00181`  | B.Sc. Sociology         | 100   |
| `21/3SOC/00182`  | B.Sc. Sociology         | 100   |

> Full list of all 200 students is available in the database. Pattern: `{YY}/{deptCode}/{5-digit-id}`

---

## First-Login Flow

1. Login with identifier + `TestPassword123!`
2. If `mustChangePassword: true` → redirected to `/change-password`
3. If `totpEnrolled: false` → redirected to `/setup-totp` to scan QR and confirm
4. On TOTP setup complete → full system access granted

---

## Database Connection

```
Host:     localhost:5432
Database: kwasu_ams
User:     kwasu
Password: kwasu_dev_password
URL:      postgresql://kwasu:kwasu_dev_password@localhost:5432/kwasu_ams
```

## Redis Connection

```
URL:  redis://localhost:6379
Port: 6379
```

## API Server

```
Base URL: http://127.0.0.1:3001
Docs:     http://127.0.0.1:3001/docs  (development only)
Health:   http://127.0.0.1:3001/health
```
