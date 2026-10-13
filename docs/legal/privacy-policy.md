# STRIDE Privacy Policy

> **DRAFT for legal review — not yet in force.** Written in Phase 0 to match what the
> app actually does today. Text in [square brackets] is a placeholder or a question for
> counsel. See [README.md](README.md) for the open questions.

**Last updated:** [date of publication]

STRIDE is a running, cycling and fitness app made by **Rootcode** ([registered company
name, registration number, registered address, Dhaka, Bangladesh]). This policy explains
what we collect when you use STRIDE, why, who can see it, and the choices you have.

If you have a question or want to use any of your rights, write to **[privacy@domain]**.

## 1. The short version

- Your activities can show where you live, work and train. You decide who sees each one:
  everyone, only your followers, or only you.
- We never sell your data, and STRIDE shows no advertising.
- Privacy zones hide the start and end of your activities from everyone but you. Your
  heatmap and your GPX files are only ever shown to you.
- You can delete your account at any time from Settings. Everything in it is erased.

## 2. What we collect

**Account.** Your name, email address and password. We store the password only as a
salted one-way hash, so we can't read it.

**Profile (optional).** City, country, short bio, profile colour, sex, birthday, height,
weight and maximum heart rate. We use height, weight, sex and birthday only to calculate
things like calories and heart-rate zones. Other people never see them.

**Activities.** When you record or import an activity we store:

- the GPS track, meaning your position about once a second with time and altitude;
- distance, times, pace and speed, and the elevation gained;
- laps and pauses;
- the sport, title, description, gear and how hard you rated the effort.

**Sensor data.** If you connect a Bluetooth heart-rate strap, speed/cadence sensor or
power meter, we store the readings with your activity. **Heart rate is health
information.** We collect it only when you choose to connect a sensor, and we use it only
to show your own analysis (heart-rate charts, zones and training load).

**Social activity.** The people you follow and who follow you, kudos, comments, posts,
clubs you join, event replies, segments you star, challenges you join, and reports you send
us.

**Technical data.**

- One cookie that keeps you signed in. We keep only a fingerprint (hash) of it.
- Your IP address. We use it briefly in memory to stop abuse such as password guessing,
  and our server logs keep it for [14] days.
- Basic error logs.

**On your phone only.**

- While you record, the activity is saved on your phone so that a crash doesn't lose it.
  It is removed once it has uploaded.
- Your display preferences.

We don't use analytics trackers or advertising cookies.

## 3. Why we use it

| Purpose | Data used | Legal basis [confirm with counsel] |
| --- | --- | --- |
| Run your account and the app | Account, activities, social activity | Our agreement with you (the Terms) |
| Analysis: splits, records, fitness, heart-rate zones | Activities, sensor data, profile measurements | Your explicit consent for heart rate; our agreement for the rest |
| Leaderboards, challenges, clubs, feed | Public and followers-only activities, as you set them | Our agreement with you |
| Keep STRIDE safe: stop spam, abuse and cheating; review reports | Activities, reports, IP address, logs | Our legitimate interest in a safe service |
| Tell you about kudos, comments, follows and records | Social activity | Our agreement with you |
| Meet legal obligations | Whatever the law requires | Legal obligation |

## 4. Who can see your data

**Other STRIDE users** see only what your settings allow:

- **Profile:** your name, profile colour, city, country, bio, follower counts and
  activity totals. They never see your email, birthday, sex, height, weight or maximum
  heart rate.
- **Activities set to Everyone:** anyone, including people who aren't signed in, can see
  them. They also appear on public segment leaderboards.
- **Activities set to Followers:** only people who follow you.
- **Activities set to Only you:** nobody else. They never appear on leaderboards.
- **Privacy zones:** when you turn one on, others don't see the first and last part of
  each activity's map (200 m to 1 km, your choice). They also don't see the exact start
  point.
- **Heatmap and GPX exports:** only you.

Your default visibility for new activities is in Settings → Privacy. You can change any
single activity later.

**Service providers.**

- **Hosting:** STRIDE runs on servers operated by Rootcode ("roothost") in [country /
  data-centre location]. Backups are stored [where].
- **Maps:** map tiles are loaded from [Esri / MapTiler / our own tile server]. Your phone
  asks for the map area you are viewing, so the tile provider sees that area and your IP
  address.
- **Route planning:** when you plan a route, the points you place are sent to an
  OpenStreetMap routing service ([routing.openstreetmap.de, run by FOSSGIS e.V.]) to
  follow the roads.
- [**Email:** when we start sending email (password resets, notifications), we will use
  [provider]. Update this section before launch.]

We share data with authorities only when Bangladeshi law requires it. [Counsel: describe
the process and how we notify users where allowed.]

We do **not** sell or rent your data, and we don't share it with advertisers.

## 5. How long we keep it

- **While your account exists:** your account and activities.
- **When you delete an activity:** it is erased at once, along with its track, kudos,
  comments and segment efforts.
- **When you delete your account:** everything in it is erased at once. That covers your
  activities and tracks, posts, comments, kudos, follows, club memberships, gear, goals,
  routes, notifications and reports. Clubs you owned pass to the next admin or member.
  Copies in our encrypted backups are overwritten within [30] days.
- **Password-reset links:** they expire after 30 minutes and are then useless.
- **Server logs:** [14] days.
- **Reports you send:** until they are reviewed, plus [12 months] in case of repeat abuse.

## 6. Your rights

You can:

- **See and correct** your data. Most of it is in the app (profile, settings, activities).
- **Download** your activities as GPX files. Today you do this one activity at a time. A
  full account export is coming soon; until then, email us and we will send it within
  [30] days.
- **Delete** any activity, or your whole account, in Settings.
- **Withdraw consent** for heart-rate data: disconnect the sensor, and delete the
  activities you no longer want analysed.
- **Object** to how we use your data, or **complain** to us at [privacy@domain]. You can
  also complain to [the data-protection authority under Bangladesh's Personal Data
  Protection Ordinance 2025, once established — counsel to confirm].

## 7. Security

- All traffic is encrypted (HTTPS).
- Passwords are hashed with scrypt.
- Session tokens and reset tokens are stored only as hashes.
- Activities are protected by the visibility rules above, and tests check those rules on
  every change.
- Sign-in and other sensitive actions are rate-limited.

No system is perfect. If a breach puts your data at risk, we will tell you and the
authorities as the law requires.

## 8. Children

STRIDE is not meant for children under **[13 / 16 — counsel]**, and they may not create
an account. If we learn that a child under this age has signed up, we will delete the
account.

## 9. Changes

We will tell you in the app at least [14] days before any change that affects how your
data is used. Small wording fixes take effect when published.

## 10. Contact

Rootcode — [address] — [privacy@domain] — [phone]
