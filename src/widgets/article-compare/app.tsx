import {memo} from 'react';

import {ARTICLE} from '@/common/compare/entity';
import {CompareApp} from '@/common/compare/compare-app';

const host = await YTApp.register();

const AppComponent = () => (
  <CompareApp host={host} adapter={ARTICLE} entityId={YTApp.entity?.id} locale={YTApp.locale}/>
);

export const App = memo(AppComponent);
