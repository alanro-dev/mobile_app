import { Component, input } from '@angular/core';

@Component({
  selector: 'app-explore-container',
  templateUrl: './explore-container.component.html',
  styleUrls: ['./explore-container.component.scss'],
  standalone: true,
  imports: [],
})
export class ExploreContainerComponent {
  readonly name = input<string>();
}