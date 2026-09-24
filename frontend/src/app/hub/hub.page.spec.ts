import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { HubPage } from './hub.page';

describe('HubPage', () => {
  let component: HubPage;
  let fixture: ComponentFixture<HubPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubPage, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HubPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});