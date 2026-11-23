// Platform administrator (SUPERADMIN) guide — English.
export default {
  title: "Platform administrator guide",
  subtitle: "For the SUPERADMIN: follow the workshops, validate subscription payments and set the plans.",
  intro:
    "The SUPERADMIN runs the Tailora platform: it does not work in a workshop's day-to-day data (clients, orders…), except through a traced impersonation. Words in quotation marks are the exact labels used in the application.",
  sections: {
    reperes: {
      title: "Finding your way around",
      steps: {
        connexion: {
          text: "Open the sign-in page, enter your [[login.identifiant]] and [[login.password]], then click [[login.submit]].",
          result: "You arrive on the platform [[sa.layout.overview]].",
        },
        menu: {
          text: "The menu gives access to [[sa.layout.overview]], [[sa.layout.workshops]], [[sa.layout.commerce]], [[sa.layout.subscriptions]], [[sa.layout.payments]], [[sa.layout.pricing]] and [[nav.myAccount]]. On a phone, these screens are in the bottom bar. The book-shaped button in the header opens this guide; the bell opens notifications.",
          result: "The chosen screen appears, its title is repeated in the header.",
        },
        indicateurs: {
          text: "On the [[sa.layout.overview]], the platform totals (workshops, accounts, clients, orders), the trends of the last six months and the [[sa.dashboard.alerts]] section (expired or soon-expiring subscriptions, suspended workshops, new workshops).",
          result: "You spot at a glance what needs action.",
        },
      },
    },
    notifications: {
      title: "The notification bell",
      steps: {
        cloche: {
          text: "Click the bell in the header: the [[sa.notifications.title]] page lists the [[sa.notifications.paymentsTitle]] (payments declared by workshops awaiting a decision) and the [[sa.notifications.alertsTitle]]. Click a payment to go and handle it.",
          result: "You see what needs your attention on the platform.",
        },
        compteur: {
          text: "The red badge only counts what needs action: declared payments to validate, subscriptions expired or expiring within 7 days. Suspended workshops and new workshops are listed on the page but do not count. There is no “read / unread”: a line disappears as soon as the situation is settled, and the counter refreshes every minute.",
          result: "When the badge is gone, nothing is waiting for your decision.",
        },
      },
    },
    paiements: {
      title: "Validating subscription payments",
      intro: "A workshop only gets its access after your check: no payment is confirmed on its declaration alone.",
      steps: {
        ouvrir: {
          text: "Open [[sa.layout.payments]]. The [[saPay.filterStatus]] filter isolates payments to check. Each row shows the workshop, plan, amount, method, the [[saPay.colReference]] entered by the workshop and who declared it.",
          result: "Payments to check are at the top of the list.",
        },
        rapprocher: {
          text: "Find the transaction on your statement (mobile money, bank, cash): the amount and reference must match the row.",
          result: "You know whether the payment is real.",
        },
        confirmer: {
          text: "If everything matches, click [[saPay.confirm]] then [[saPay.confirmYes]]. The subscription is activated and a numbered receipt (FAC-YYYY-NNNN) is issued; the workshop is notified by email. A decision only acts once, even if replayed.",
          result: "The message [[saPay.done]] appears; the receipt can be downloaded via [[saPay.invoice]].",
        },
        rejeter: {
          text: "If the payment cannot be found or is wrong, click [[saPay.reject]], enter the reason (mandatory) then click [[saPay.rejectConfirm]].",
          result: "The payment is rejected, no access is granted, and the workshop sees the reason.",
        },
        rembourser: {
          text: "For an already confirmed payment, click [[saPay.refund]], enter the reason (mandatory) then click [[saPay.refundConfirm]]. Refunds are total only. [[saPay.refundNote]]",
          result: "The receipt is marked cancelled (it is kept) and the subscription is cancelled.",
        },
      },
    },
    ateliers: {
      title: "Managing workshops",
      steps: {
        liste: {
          text: "Open [[sa.layout.workshops]]. Search a workshop by name; the [[sa.ateliers.colStatus]] column shows whether it is active or suspended.",
          result: "You find the workshop you want.",
        },
        creer: {
          text: "Click [[sa.ateliers.newWorkshop]], fill in the [[sa.ateliers.formName]], the currency, then, in [[sa.ateliers.firstAdmin]], an [[sa.ateliers.formIdentifier]] and a [[sa.ateliers.formPassword]]. Click [[sa.ateliers.createWorkshop]] and give the identifier and password to the owner.",
          result: "The workshop is created; its owner can sign in with this identifier.",
        },
        fiche: {
          text: "Click [[sa.ateliers.manage]] on a row. The record gathers the [[sa.detail.sectionInfo]], the [[sa.detail.sectionAccounts]], the subscription, the [[sa.detail.sectionActivity]] and the [[sa.detail.sectionImpersonation]].",
          result: "You see everything about this workshop.",
        },
        suspendre: {
          text: "To block a workshop's access, click [[sa.detail.suspend]] then [[sa.detail.yesSuspend]]. No account of the workshop can use the application until you click [[sa.detail.reactivate]].",
          result: "The workshop becomes [[sa.detail.statusSuspended]]. Nothing is deleted.",
        },
        motdepasse: {
          text: "To help an owner who lost access, click [[sa.detail.resetPassword]] on their account, then [[sa.detail.generate]] (or type a password of at least 8 characters) and [[sa.detail.confirmReset]]. Copy it with [[sa.detail.copy]] and pass it on: it is no longer shown once the window is closed.",
          result: "The owner can sign in again with this password.",
        },
        supprimer: {
          text: "The [[sa.detail.dangerZone]] lets you delete a workshop: [[sa.detail.deleteWorkshop]] then [[sa.detail.yesDelete]]. It is final and impossible as soon as the workshop holds any data (clients, orders, expenses, subscriptions). For a workshop that has been used, prefer [[sa.detail.suspend]].",
          result: "Only a completely empty workshop can be deleted.",
        },
      },
    },
    impersonation: {
      title: "Signing in as a workshop account (impersonation)",
      intro: "Use it only to help a workshop that asks you to: you see the application exactly as its user does.",
      steps: {
        entrer: {
          text: "In the workshop's record, section [[sa.detail.sectionAccounts]], click [[sa.detail.impersonate]] on the wanted account, then confirm the question shown.",
          result: "You are in the workshop's application, under that account's identity.",
        },
        agir: {
          text: "A banner stays at the top of the screen to remind you that you are acting under this account's identity (with your SUPERADMIN name). The session lasts 2 hours at most. The workshop is never restricted during impersonation, even when read-only: act carefully, your actions are made in the account's name.",
          result: "You can reproduce and fix the workshop's problem.",
        },
        quitter: {
          text: "Click [[ui.impersonation.quit]] in the banner.",
          result: "You get your SUPERADMIN session back.",
        },
        trace: {
          text: "Every impersonation is recorded: find them in the workshop's record, section [[sa.detail.sectionImpersonation]], and in the platform's security log.",
          result: "A trace remains of who signed in, on which account.",
        },
      },
    },
    abonnements: {
      title: "Workshop subscriptions",
      steps: {
        vue: {
          text: "Open [[sa.layout.subscriptions]]: each workshop is listed with its state (free trial, active, expired, suspended…), plan and expiry date. A subscription is activated from the workshop's record.",
          result: "You spot the workshops to follow up.",
        },
        activer: {
          text: "In the workshop's record, subscription section, open [[saSub.form.title]]. Choose [[saSub.form.modeCatalogue]] (plan and period at the catalogue price, frozen in the subscription) or [[saSub.form.modeExceptional]] (duration and amount entered, reason mandatory), then click [[saSub.form.submit]].",
          result: "The message [[saSub.form.done]] appears and the subscription shows in the history.",
        },
        actions: {
          text: "In the same section, [[saSub.actions.suspend]] puts the workshop in read-only mode immediately (reason mandatory, reversible with [[saSub.actions.reactivate]]), [[saSub.actions.expire]] ends the subscription right away and [[saSub.actions.deactivate]] disables it. Every action is dated, signed and logged in the history.",
          result: "The workshop's state is updated and the history keeps the trace.",
        },
      },
    },
    formules: {
      title: "Plans and pricing",
      intro: "No price is offered by default: a plan is only offered to workshops once it is active, priced and its limits are defined.",
      steps: {
        creer: {
          text: "Open [[sa.layout.pricing]] then click [[saSub.plans.newPlan]]. Fill in the name, display order, description and features (one per line).",
          result: "The plan is created.",
        },
        prix: {
          text: "In [[saSub.plans.pricesTitle]], enter the [[saSub.plans.fieldPriceMonthly]] and the [[saSub.plans.fieldPriceYearly]] as whole numbers. Leave a field empty to not offer that period. Also set the plan's limits (clients, employees, active orders, models).",
          result: "Workshops see the catalogue prices; the prices of subscriptions already taken do not change.",
        },
        activer: {
          text: "Click [[saSub.plans.activate]] to offer the plan to workshops (or [[saSub.plans.deactivate]] to withdraw it). If activation is impossible (plan with no price or undefined limits), the application shows the reasons just below.",
          result: "The plan appears (or disappears) on the workshops' Subscription page.",
        },
        contact: {
          text: "At the bottom of the page, the [[saSub.contact.title]] section lets you enter the number (with country code) shown to owners behind the “Contact the administrator” button; click [[saSub.contact.save]].",
          result: "The message [[saSub.contact.saved]] appears.",
        },
      },
    },
    reglages: {
      title: "Commercial dashboard and settings",
      steps: {
        commerce: {
          text: "Open [[sa.layout.commerce]]: [[saCom.revenueTitle]] (collected, refunded, net), trial conversion, renewals, payments to check and renewals to follow.",
          result: "You follow the platform's commercial activity.",
        },
        grace: {
          text: "Further down, the [[saCom.settingsTitle]] section holds the [[saCom.graceDays]] (full access after the due date, from 0 to 90 days, before read-only) and the [[saCom.instructions]] shown to subscribing workshops (mobile payment number, bank account…). Save your changes.",
          result: "The message [[saCom.saved]] appears and workshops see your instructions.",
        },
      },
    },
    compte: {
      title: "Your account and language",
      steps: {
        langue: {
          text: "Open [[nav.myAccount]]. Choose the [[account.language]]: it is saved on your account and applies to the interface and emails. To change your password, enter [[account.currentPassword]], the new password and its confirmation. The SUPERADMIN space has no FR / EN button in the header: the language is set here.",
          result: "The message [[account.passwordChanged]] appears after a password change.",
        },
      },
    },
  },
};
