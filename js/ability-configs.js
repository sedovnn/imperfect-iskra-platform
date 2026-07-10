// i(m)perfect — конфиги способностей (модель Strat OS, фаза 1: AK1/PP1/PR2).
// Кейс контент — «Искра»; сама способность и формат вопроса — общая методология.
// Каждый конфиг: gateOn (код предыдущей способности в последовательности или null),
// stages — массив описаний экранов, которые рендерит js/ability-engine.js.

(function () {
  var AK1_DOMAINS = [
    { key: 'competitors', label: 'Конкуренты и их шаги (уход Omnia, Nord Labs, стартап Loop)' },
    { key: 'techShift', label: 'Технологический/продуктовый сдвиг в отрасли (безэкранные интерфейсы, ИИ-ответы)' },
    { key: 'marketStructure', label: 'Структура и динамика рынка в целом (ритейл-медиа, супераппы)' },
    { key: 'ownership', label: 'Новый собственник и корпоративный центр' },
    { key: 'talent', label: 'Рынок труда и отток талантов' }
  ];

  window.ABILITY_CONFIGS = {

    AK1: {
      code: 'AK1',
      gateOn: null,
      title: 'АК-1 · Широта охвата факторов среды',
      intro: {
        kicker: 'Постановка',
        text: 'Кирилл Агеев, гендиректор «Искры», созывает вас как консультанта проанализировать ситуацию компании. Прежде чем строить карту проблем — какие внешние факторы вы вообще держите в поле зрения?'
      },
      stages: [
        {
          type: 'checklist',
          key: 'domains',
          question: 'Какие внешние факторы вы бы учли, анализируя стратегическую ситуацию «Искры»? Отметьте всё, что считаете важным.',
          options: AK1_DOMAINS
        },
        {
          type: 'freeText',
          key: 'extra',
          optional: true,
          question: 'Что ещё, помимо перечисленного, вы бы держали в поле зрения — то, чего нет явно в материалах, но логически важно?',
          placeholder: 'необязательно — оставьте пустым, если нечего добавить'
        }
      ]
    },

    PP1: {
      code: 'PP1',
      gateOn: 'AK1',
      title: 'ПП-1 · Декомпозиция цели и выстраивание маршрута',
      intro: {
        kicker: 'Постановка',
        text: 'Постройте путь от того, где «Искра» находится сейчас, к тому, где она должна оказаться, если стратегия сработает.'
      },
      stages: [
        {
          type: 'template',
          key: 'goalTemplate',
          question: 'Текущее и целевое положение',
          fields: [
            { key: 'current', label: 'Текущее положение «Искры» (одним предложением)', placeholder: 'например: рекламная монополия с убыточным побочным направлением' },
            { key: 'target', label: 'Целевое положение через 3–5 лет, если стратегия сработает', placeholder: 'например: …' }
          ]
        },
        {
          type: 'stepBuilder',
          key: 'steps',
          question: 'Из каких этапов состоит путь от текущего к целевому?',
          maxItems: 5,
          addLabel: '+ этап'
        },
        {
          type: 'dependencyBuilder',
          key: 'dependencies',
          stepsKey: 'steps',
          question: 'Почему следующий этап начинается именно после предыдущего?',
          reasonOptions: [
            { value: 'resource', label: 'предыдущий этап даёт нужный ресурс/результат' },
            { value: 'constraint', label: 'предыдущий этап снимает конкретное ограничение' },
            { value: 'time', label: 'просто идёт по времени' },
            { value: 'other', label: 'другое' }
          ]
        },
        {
          type: 'freeText',
          key: 'verificationText',
          optional: true,
          question: 'Есть ли критерии, по которым вы поймёте, что пора пересмотреть путь?',
          placeholder: 'необязательно'
        }
      ]
    },

    PR2: {
      code: 'PR2',
      gateOn: 'PP1',
      title: 'ПР-2 · Обоснование стратегического выбора',
      intro: {
        kicker: 'Постановка',
        text: 'В правлении «Искры» оформились две позиции по развилке. Дайте рекомендацию — и удержите её, если кто-то надавит.'
      },
      stages: [
        {
          type: 'singleChoiceWithText',
          key: 'forkChoice',
          textKey: 'forkRationale',
          question: 'Развилка из письма Агеева — какая позиция вам ближе?',
          options: [
            { value: 'fortress', label: '«Крепость» — фокус на рекламном ядре' },
            { value: 'second_curve', label: '«Вторая кривая» — выделить «Миру» в отдельную компанию' },
            { value: 'both_incomplete', label: 'Обе позиции неполны' }
          ],
          textLabel: 'Рекомендация и честно названная цена выбора'
        },
        {
          type: 'stressTest',
          choiceKey: 'stressTestChoice',
          commentKey: 'stressTestComment',
          challengeText: 'Штерн говорит: «Правление хочет одно решение, а не два сценария — если через полгода станет ясно, что вы ошиблись, готовы сразу развернуться?»',
          options: [
            { value: 'hold', label: 'Остаюсь при своей рекомендации' },
            { value: 'change', label: 'Меняю рекомендацию' }
          ]
        },
        {
          type: 'freeText',
          key: 'proactiveText',
          optional: true,
          question: 'При каком условии вы бы заранее заложили пересмотр этого выбора?',
          placeholder: 'необязательно'
        }
      ]
    }

  };

  window.ABILITY_SEQUENCE = ['AK1', 'PP1', 'PR2'];
})();
